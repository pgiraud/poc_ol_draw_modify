var map;

var OSRM_PRECISION = 6;

var options = {
    controls: [
        new OpenLayers.Control.Attribution(),
        new OpenLayers.Control.TouchNavigation({
            dragPanOptions: {
                enableKinetic: true
            }
        })
    ],
    theme: null,
    layers: [new OpenLayers.Layer.OSM(
        null,
        ['http://a.tiles.mapbox.com/v3/dennisl.map-dfbkqsr2/${z}/${x}/${y}.png']
    )]
};

map = new OpenLayers.Map('map',options);

map.setCenter(
    new OpenLayers.LonLat(6.547, 46.572).transform(
        new OpenLayers.Projection("EPSG:4326"),
        map.getProjectionObject()
    ),12
);



var context = {
    getZIndex: function(feature) {
        return (feature.geometry instanceof OpenLayers.Geometry.Point) ? 1 : 0;
    }
}
var style = OpenLayers.Util.applyDefaults({
        graphicWidth: 35,
        graphicHeight: 46,
        graphicYOffset: -38,
        graphicOpacity: 1,
        graphicZIndex: "${getZIndex}",
        externalGraphic: 'marker.png',
        strokeColor: 'blue',
        strokeWidth: 3,
        strokeOpacity: 0.5
    }, OpenLayers.Feature.Vector.style['default']);
var temporarystyle = OpenLayers.Util.applyDefaults({
    strokeColor: 'red',
    graphicName: 'square'
}, OpenLayers.Feature.Vector.style['temporary']);
var styleMap = new OpenLayers.StyleMap({
    "default": new OpenLayers.Style(style, {context: context}),
    // we don't want to use the temporary directly since it can be changed
    // later
    "temporary": new OpenLayers.Style(temporarystyle, {context: context})
});
var layer = new OpenLayers.Layer.Vector('track', {
    styleMap: styleMap,
    rendererOptions: {
        zIndexing: true
    }
});
map.addLayer(layer);
var drawControl = new OpenLayers.Control.DrawFeature(
    layer,
    OpenLayers.Handler.Point
);
map.addControl(drawControl);
drawControl.activate();

// the track line
var track;
// the track points (ordered)
var trackPoints = [];
layer.events.on({
    'featureadded': function(obj) {
        if (!(obj.feature.geometry instanceof OpenLayers.Geometry.Point)) {
            return;
        }
        if (snapped !== null) {
            trackPoints.splice(snapped + 1, 0, obj.feature.geometry);
        } else {
            trackPoints.push(obj.feature.geometry);
        }
        if (trackPoints.length >= 2) {
            getRoute();
        }
    },
    'featuremodified': function(obj) {
        if (trackPoints.length >= 2) {
            getRoute();
        }
    }
});

function drawRoute(points) {
    // remove any existing track
    if (track) {
        layer.removeFeatures([track]);
    }
    var line = new OpenLayers.Geometry.LineString(points);
    track = new OpenLayers.Feature.Vector(line);
    layer.addFeatures([track]);
}

var HoverFeatureControl = OpenLayers.Class(OpenLayers.Control, {
    initialize: function(layer, options) {
        OpenLayers.Control.prototype.initialize.apply(this, [options]);
        this.layer = layer;
        this.handler = new OpenLayers.Handler.Feature(
            this, layer, {
                over: this.overFeature,
                out: this.outFeature
            }
        );
    },
    overFeature: function(feature) {
        if (feature.geometry instanceof OpenLayers.Geometry.Point) {
            drawControl.deactivate();
        }
    },
    outFeature: function(feature) {
        drawControl.activate();
    },
    setMap: function(map) {
        this.handler.setMap(map);
        OpenLayers.Control.prototype.setMap.apply(this, arguments);
    }
});
var hoverControl = new HoverFeatureControl(layer);
map.addControl(hoverControl);
hoverControl.activate();

var modifyControl = new OpenLayers.Control.ModifyFeature(layer, {
    geometryTypes: ['OpenLayers.Geometry.Point']
});
map.addControl(modifyControl);
modifyControl.activate();

var snappingControl = new OpenLayers.Control.Snapping({
    layer: layer,
    precedence: ['edge'],
    defaults: {
        tolerance: 15
    }
});

// get the index of the segment to which the snapping occured
function getSegmentIndex(point) {
    var segmentIndex;
    var i;
    for (i=1; i < trackPoints.length; i++) {
        var components = [trackPoints[i - 1], trackPoints[i]];
        var segment = new OpenLayers.Geometry.LineString([
            trackPoints[i - 1].clone(),
            trackPoints[i].clone()
        ]);
        if (point.distanceTo(segment) < 0.001) {
            segmentIndex = i - 1;
            continue;
        }
    }
    return segmentIndex;
}

// stores the index of the segment to which the mouse is snapped
var snapped = null;

snappingControl.events.on({
    'snap': function(obj) {
        map.div.style.cursor = 'pointer';
        snapped = getSegmentIndex(obj.point);
        drawControl.handler.style = OpenLayers.Util.applyDefaults({
            externalGraphic: 'marker_plus.png'
        }, style);
    },
    'unsnap': function(obj) {
        this.map.div.style.cursor = '';
        snapped = null;
        delete drawControl.handler.style;
    },
    scope: this
});

map.addControl(snappingControl);
snappingControl.activate();


var protocol = new OpenLayers.Protocol.Script({
    callbackKey: 'jsonp',
    callback: function(request) {
        var decoded = decodeGeometry(request.data.route_geometry, OSRM_PRECISION);
        var lonlats = decoded.lonlat;
        var points = [];
        console.log(lonlats[0], lonlats[lonlats.length - 1]);
        for (var i = 0; i < lonlats.length; i++) {
            var lonlat = lonlats[i];
            var point = new OpenLayers.Geometry.Point(lonlat[1], lonlat[0]);
            points.push(point.transform('EPSG:4326', map.getProjection()));
        }
        drawRoute(points);
        //layer.addFeatures([new OpenLayers.Feature.Vector(line)]);
    }
});
// Calls the OSRM service
function getRoute() {
    var locs = [];
    for (var i=0; i < trackPoints.length; i++) {
        var pt = trackPoints[i].clone().transform(map.getProjection(), 'EPSG:4326')
        // Note: loc=lat,lon
        locs.push([pt.y.toPrecision(6), pt.x.toPrecision(6)].join(','));
    }
    console.log(locs);
    locs = locs.join('&loc=');
    locs = "?loc=" + locs;
    protocol.read({
        url: "http://schweizmobil-r2014.gis.internal/osrm/viaroute" + locs,
        params: {
            instructions: false,
            elevation: true,
            output: 'json',
            z: map.getZoom()
        }
    });
}

function decodeGeometry(encoded, precision) {
    //decode compressed route geometry
    precision = Math.pow(10, -precision);
    var len = encoded.length, index = 0, lat = 0, lng = 0, ele = 0, array = [];
    var ele_array = [];
    while (index < len) {
        var b, shift = 0, result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        var dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;
        shift = 0;
        result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        var dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;

        shift = 0;
        result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        var dele = ((result & 1) ? ~(result >> 1) : (result >> 1));
        ele += dele;
        ele_array.push( ele * precision * 1000 );

        array.push( [lat * precision, lng * precision] );
    }
    //console.log(ele_array);
    return {'lonlat': array, 'ele': ele_array};
}

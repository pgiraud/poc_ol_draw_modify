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
// the corresponding vector feature
var trackFeature;
// the track points (ordered)
var viaPositions = [];
layer.events.on({
    'featureadded': function(obj) {
        if (!(obj.feature.geometry instanceof OpenLayers.Geometry.Point)) {
            return;
        }
        if (snapped !== null) {
            var index = findViaIndex(snapped);
            viaPositions.splice(index + 1, 0, obj.feature.geometry);
        } else {
            viaPositions.push(obj.feature.geometry);
        }
        if (viaPositions.length >= 2) {
            getRoute();
        }
    }
});

function drawRoute(points) {
    // remove any existing track
    if (trackFeature) {
        layer.removeFeatures([trackFeature]);
    }
    track = new OpenLayers.Geometry.LineString(points);
    trackFeature = new OpenLayers.Feature.Vector(track);
    layer.addFeatures([trackFeature]);
}

var dragTimeout;
var dragControl = new OpenLayers.Control.DragFeature(layer, {
    geometryTypes: ['OpenLayers.Geometry.Point'],
    onEnter: function(obj) {
        drawControl.deactivate();
    },
    onLeave: function(obj) {
        drawControl.activate();
    },
    onDrag: function(obj) {
        clearTimeout(dragTimeout);
        dragTimeout = window.setTimeout(function() {
            if (viaPositions.length >= 2) {
                getRoute();
            }
        }, 100);
    }
});
map.addControl(dragControl);
dragControl.activate();

var clickFeatureControl = new (OpenLayers.Class(OpenLayers.Control, {
    initialize: function(layer, options) {
        OpenLayers.Control.prototype.initialize.apply(this, [options]);
        this.layer = layer;
        this.handler = new OpenLayers.Handler.Feature(
            this, layer, {
                dblclick: this.removeFeature
            }
        );
    },
    removeFeature: function(feature) {
        removeViaPosition(feature);
        // force draw control reactivation
        drawControl.activate();
    },
    setMap: function(map) {
        this.handler.setMap(map);
        OpenLayers.Control.prototype.setMap.apply(this, arguments);
    }
}))(layer);
map.addControl(clickFeatureControl);
clickFeatureControl.activate();


var snappingControl = new OpenLayers.Control.Snapping({
    layer: layer,
    precedence: ['edge'],
    defaults: {
        tolerance: 15
    }
});

function removeViaPosition(feature) {
    var index;
    for (var i = 0; i < viaPositions.length; i++) {
        var viaPosition = viaPositions[i];
        if (viaPosition == feature.geometry) {
            index = i;
            break;
        }
    }
    if (index) {
        viaPositions.splice(index, 1);
        layer.removeFeatures([feature]);
        getRoute();
    }
}

// get the index of the track segment to which the snapping occured
function findTrackIndex(point) {
    var segmentIndex;
    var minDist = Number.MAX_VALUE;
    for (var i = 1; i < track.components.length; i++) {
        var segment = new OpenLayers.Geometry.LineString([
            track.components[i - 1].clone(),
            track.components[i].clone()
        ]);
        var dist = point.distanceTo(segment);
        if (dist < minDist) {
            minDist = dist;
            segmentIndex = i;
        }
    }
    return segmentIndex;
}

// find at which index in the via points the new via point should be added
function findViaIndex(newViaPoint) {
    // find the index along the whole track
    var newTrackIndex = findTrackIndex(newViaPoint);

    // now compare with the index of each via points
    var index = 0;
    var i = 0;
    var before = true;
    while ( before ) {
        index = i;
        i++;
        before = findTrackIndex(viaPositions[i]) < newTrackIndex;
    }
    return index;
}

// stores the index of the segment to which the mouse is snapped
var snapped = null;

snappingControl.events.on({
    'snap': function(obj) {
        map.div.style.cursor = 'pointer';
        snapped = obj.point;
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
    for (var i=0; i < viaPositions.length; i++) {
        var pt = viaPositions[i].clone().transform(map.getProjection(), 'EPSG:4326')
        // Note: loc=lat,lon
        locs.push([pt.y.toPrecision(6), pt.x.toPrecision(6)].join(','));
    }
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

var map;

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
    layers: [new OpenLayers.Layer.OSM()]
};

map = new OpenLayers.Map('map',options);

map.setCenter(
    new OpenLayers.LonLat(7, 46.472).transform(
        new OpenLayers.Projection("EPSG:4326"),
        map.getProjectionObject()
    ),11
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
        // remove any existing track
        if (track) {
            layer.removeFeatures([track]);
        }
        if (trackPoints.length >= 2) {
            var line = new OpenLayers.Geometry.LineString(trackPoints);
            track = new OpenLayers.Feature.Vector(line);
            layer.addFeatures([track]);

            getRoute();
        }
    },
    'featuremodified': function(obj) {
        if (track) {
            layer.drawFeature(track);
        }
    }
});

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
        var feature = format.read(request.data.route_geometry);
        console.log(feature.geometry);
        //layer.addFeatures([feature]);
    }
});
var format = new OpenLayers.Format.EncodedPolyline();
// Calls the OSRM service
function getRoute() {
    var locs = [];
    for (var i=0; i < trackPoints.length; i++) {
        var pt = trackPoints[i].clone().transform('EPSG:3857', 'EPSG:4326')
        locs.push([pt.x, pt.y].join(','));
    }
    locs = locs.join('&loc=');
    locs = "?loc=" + locs;
    protocol.read({
        url: "http://schweizmobil-r2014.gis.internal/osrm/viaroute" + locs,
        params: {
            instructions: false,
            output: 'json',
            z: 11
        }
    });
}

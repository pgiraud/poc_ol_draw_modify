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
    new OpenLayers.LonLat(-71.147, 42.472).transform(
        new OpenLayers.Projection("EPSG:4326"),
        map.getProjectionObject()
    ), 7
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
        strokeOpacity: 0.5,
        cursor: 'move'
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
        }
    },
    'featuremodified': function(obj) {
        if (track) {
            layer.drawFeature(track);
        }
    }
});

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
        drawControl.handler.style = style;
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

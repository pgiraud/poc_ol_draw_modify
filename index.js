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



var style = new OpenLayers.StyleMap({
    "default": OpenLayers.Util.applyDefaults({
        graphicWidth: 21,
        graphicHeight: 25,
        graphicYOffset: -25, // shift graphic up 28 pixels
        graphicOpacity: 1,
        externalGraphic: 'http://www.openlayers.org/dev/img/marker.png'
    }, OpenLayers.Feature.Vector.style['default'])
});
var layer = new OpenLayers.Layer.Vector('track', {
    styleMap: style
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
        trackPoints.push(obj.feature.geometry);
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

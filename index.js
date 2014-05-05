var map;

var OSRM_PRECISION = 6;

var options = {
    controls: [
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

var control = new VelolandTrack();
map.addControl(control);
control.activate();

control.events.on({
    'trackmodified': function() {
        console.log("modified");
        control.drawRoute(control.viaPoints);
    }
});

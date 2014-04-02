var map;
 
var options = {
    controls: [
        new OpenLayers.Control.Attribution(),
        new OpenLayers.Control.TouchNavigation({
            dragPanOptions: {
                enableKinetic: true
            }
        }),
        new OpenLayers.Control.Zoom(),
        new OpenLayers.Control.LayerSwitcher()
    ],
    projection: new OpenLayers.Projection('EPSG:900913'),
    maxExtent: [-20037508.34, -20037508.34, 20037508.34, 20037508.34],
    resolutions: resolutions,
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
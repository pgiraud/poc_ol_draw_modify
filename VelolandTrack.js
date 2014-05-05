VelolandTrack = OpenLayers.Class(OpenLayers.Control, {

    /**
     * Property: drawControl
     * {OpenLayers.Control.DrawFeature}
     */
    drawControl: null,

    /**
     * Property: dragControl
     * {OpenLayers.Control.DragFeature}
     */
    dragControl: null,

    /**
     * Property: clickControl
     * {OpenLayers.Control}
     */
    clickControl: null,

    /**
     * Property: snappingControl
     * {OpenLayers.Control.Snapping}
     */
    snappingControl: null,

    /**
     * Property: trackFeature
     * {OpenLayers.Feature.Vector}
     */
    trackFeature: null,

    /**
     * Property: lineBackFeature
     * {OpenLayers.Feature.Vector} Line background (for styling)
     */
    lineBackFeature: null,

    /**
     * Property: viaPoints
     * {Array} The list of via positions (added by user)
     */
    viaPoints: null,

    /**
     * Property: snapped
     * {Object} If snapped to existing track route returns index of the segment
     * otherwise null.
     */
    snapped: null,

    /**
     * Property: dragTimeout
     * {TimeoutId} The id of the drag time out. This prevent the service to be
     * requested to much when user moves an existing point.
     */
    dragTimeout: null,

    /**
     * Property: dirty
     * {Boolean} Tells whether a track was newly drawn or modified.
     */
    dirty: false,

    /**
     * Method: initialize
     */
    initialize: function(layer, options) {
        OpenLayers.Control.prototype.initialize.apply(this, [options]);
        this.layer = layer;

        this.createStyleMap();

        this.createDrawControl();
        this.createDragControl();
        this.createClickControl();
        this.createSnappingControl();

        this.viaPoints = [];

        this.addLayerEvents();
        this.addSnappingControlEvents();
    },

    activate: function() {
        OpenLayers.Control.prototype.activate.call(this);
        this.drawControl.activate();
        this.dragControl.activate();
        this.clickControl.activate();
        this.snappingControl.activate();
        this.layer.setVisibility(true);
    },

    deactivate: function() {
        OpenLayers.Control.prototype.deactivate.call(this);
        this.drawControl.deactivate();
        this.dragControl.deactivate();
        this.clickControl.deactivate();
        this.snappingControl.deactivate();
        this.layer.setVisibility(false);
    },

    setMap: function(map) {
        OpenLayers.Control.prototype.setMap.apply(this, arguments);
        this.map.addControls([
            this.drawControl,
            this.clickControl,
            this.dragControl
        ]);
    },

    /**
     * Method: createStyleMap
     * Creates the StyleMap and configure the layer with it
     */
    createStyleMap: function() {
        var context = {
            getZIndex: function(feature) {
                return (feature.geometry instanceof OpenLayers.Geometry.Point) ? 1 : 0;
            },
            getColor: function(feature) {
                return feature.background ? 'white' : 'red';
            },
            getStrokeWidth: function(feature) {
                return feature.background ? 7 : 3;
            }
        };
        var style = OpenLayers.Util.applyDefaults({
                graphicWidth: 24,
                graphicHeight: 24,
                graphicOpacity: 2,
                graphicZIndex: "${getZIndex}",
                externalGraphic: 'images/marker.png',
                strokeColor: "${getColor}",
                strokeWidth: "${getStrokeWidth}",
                strokeOpacity: 0.6
            }, OpenLayers.Feature.Vector.style['default']);
        var temporarystyle = OpenLayers.Util.applyDefaults({
            strokeColor: 'red',
            graphicName: 'square',
            graphicZIndex: 2
        }, OpenLayers.Feature.Vector.style.temporary);
        var styleMap = new OpenLayers.StyleMap({
            "default": new OpenLayers.Style(style, {context: context}),
            // we don't want to use the temporary directly since it can be changed
            // later
            "temporary": new OpenLayers.Style(temporarystyle, {context: context})
        });
        this.layer.styleMap = styleMap;
    },

    /**
     * Method: createDrawControl
     * Creates the draw control
     */
    createDrawControl: function() {
        this.drawControl = new OpenLayers.Control.DrawFeature(
            this.layer,
            OpenLayers.Handler.Point
        );
    },

    /**
     * Method: createDragControl
     * Creates the drag control
     */
    createDragControl: function() {
        var self = this;
        this.dragControl = new OpenLayers.Control.DragFeature(self.layer, {
            geometryTypes: ['OpenLayers.Geometry.Point'],
            onEnter: function(obj) {
                // defer deactivating to prevent error with drawFeature control being
                // deactivated while adding a point
                window.setTimeout(function() {
                    self.drawControl.deactivate();},
                    1
                );
            },
            onLeave: function(obj) {
                self.drawControl.activate();
            },
            onDrag: function(obj) {
                clearTimeout(self.dragTimeout);
                self.dragTimeout = window.setTimeout(function() {
                    if (self.viaPoints.length >= 2) {
                        self.onTrackModified();
                    }
                }, 100);
            }
        });
    },

    /**
     * Method: createClickControl
     * Creates the click control
     */
    createClickControl: function() {
        var self = this;
        this.clickControl = new (OpenLayers.Class(OpenLayers.Control, {
            initialize: function(layer, options) {
                OpenLayers.Control.prototype.initialize.apply(this, [options]);
                this.layer = self.layer;
                this.handler = new OpenLayers.Handler.Feature(
                    this, self.layer, {
                        dblclick: this.removeFeature
                    }
                );
            },
            removeFeature: function(feature) {
                self.removeViaPosition(feature);
                // force draw control reactivation
                self.drawControl.activate();
                // explicitely call outFeature so that drag control is in a
                // correct state
                self.dragControl.outFeature(feature);
            },
            setMap: function(map) {
                this.handler.setMap(map);
                OpenLayers.Control.prototype.setMap.apply(this, arguments);
            }
        }))(self.layer);
    },

    /**
     * Method: createSnappingontrol
     * Creates the snapping control
     */
    createSnappingControl: function() {
        this.snappingControl = new OpenLayers.Control.Snapping({
            layer: this.layer,
            precedence: ['edge'],
            defaults: {
                tolerance: 15
            }
        });
    },

    /**
     * Method: addLayerEvents
     * Adds events listeners on the map
     */
    addLayerEvents: function() {
        this.layer.events.on({
            'featureadded': function(obj) {
                if (!(obj.feature.geometry instanceof
                      OpenLayers.Geometry.Point) ||
                    obj.feature.state != OpenLayers.State.INSERT) {
                    return;
                }

                if (this.snapped !== null) {
                    var index = this.findViaIndex(this.snapped);
                    this.viaPoints.splice(index + 1, 0,
                        obj.feature.geometry);
                } else {
                    this.viaPoints.push(obj.feature.geometry);
                }

                if (this.viaPoints.length >= 2 && this.active) {
                    this.onTrackModified();
                }
            },
            'scope': this
        });
    },

    /**
     * Method: addSnappingControlEvents
     * Adds events listeners on snapping control
     */
    addSnappingControlEvents: function() {
        this.snappingControl.events.on({
            'snap': function(obj) {
                this.map.div.style.cursor = 'pointer';
                this.snapped = obj.point;
                this.drawControl.handler.style = OpenLayers.Util.applyDefaults({
                    externalGraphic: 'images/marker_plus.png'
                }, this.layer.styleMap.styles['default'].defaultStyle);
            },
            'unsnap': function(obj) {
                this.map.div.style.cursor = '';
                this.snapped = null;
                delete this.drawControl.handler.style;
            },
            scope: this
        });
    },


    /**
     * Method: onTrackModified
     * Triggers a 'trackmodified' event so that a routing service can be called
     *     (OSRM for example). A route may not be computed. The control itself
     *     has no knowledge about if a service should be called or not.
     */
    onTrackModified: function() {
        this.events.triggerEvent('trackmodified');
        this.dirty = true;
    },
    /**
     * Method: drawRoute
     * Draws the track route on map
     *
     * Parameters:
     * points - list of points
     */
    drawRoute: function(points) {
        // remove any existing track
        if (this.trackFeature) {
            this.layer.removeFeatures([this.trackFeature, this.lineBackFeature]);
        }
        var line = new OpenLayers.Geometry.LineString(points);
        if (!this.trackFeature) {
            this.trackFeature = new OpenLayers.Feature.Vector(line);
            this.lineBackFeature = new OpenLayers.Feature.Vector(line.clone());
            this.lineBackFeature.background = true;
        } else {
            this.trackFeature.geometry = line;
            this.lineBackFeature.geometry = line.clone();
        }
        this.layer.addFeatures([this.lineBackFeature, this.trackFeature]);
    },

    /**
     * Method: removeViaPosition
     * Removes a position from the via positions
     *
     * Parameters:
     * feature {OpenLayers.Feature.Vector}
     */
    removeViaPosition: function(feature) {
        var index;
        for (var i = 0; i < this.viaPoints.length; i++) {
            var viaPosition = this.viaPoints[i];
            if (viaPosition == feature.geometry) {
                index = i;
                break;
            }
        }
        if (index) {
            this.viaPoints.splice(index, 1);
            this.layer.removeFeatures([feature]);
            if (this.viaPoints.length > 1) {
                this.events.triggerEvent('trackmodified');
                this.onTrackModified();
                this.layer.removeFeatures([this.trackFeature,
                                           this.lineBackFeature]);
            }
        }
    },

    /**
     * Method: findTrackIndex
     * Get the index of the track segment to which the snapping occured
     *
     * Parameters:
     * point {OpenLayers.Geometry.Point}
     */
    findTrackIndex: function(point) {
        var segmentIndex;
        var minDist = Number.MAX_VALUE;
        var line = this.trackFeature.geometry;
        for (var i = 1; i < line.components.length; i++) {
            var segment = new OpenLayers.Geometry.LineString([
                line.components[i - 1].clone(),
                line.components[i].clone()
            ]);
            var dist = point.distanceTo(segment);
            if (dist < minDist) {
                minDist = dist;
                segmentIndex = i;
            }
        }
        return segmentIndex;
    },

    /**
     * Method: findViaIndex
     * Finds at which index in the via points the new via point should be added
     *
     * Parameters:
     * newViaPoint {OpenLayers.Geometry.Point}
     */
    findViaIndex: function(newViaPoint) {
        // find the index along the whole track
        var newTrackIndex = this.findTrackIndex(newViaPoint);

        // now compare with the index of each via points
        var index = 0;
        var i = 0;
        var before = true;
        while ( before ) {
            index = i;
            i++;
            before = this.findTrackIndex(this.viaPoints[i]) < newTrackIndex;
        }
        return index;
    },

    /**
     * Method: clearDrawing
     * Removes any exising drawn track and reset viaPoints.
     */
    clearDrawing: function() {
        this.viaPoints = [];
        this.layer.removeFeatures(this.layer.features);
        this.trackFeature = null;
        this.lineBackFeature = null;
        this.dirty = false;
    },

    /**
     * Method: loadTrack
     *
     * Parameters:
     * feature {OpenLayers.Feature.Vector}
     */
    loadTrack: function(feature) {
        if (this.active) {
            this.layer.removeFeatures([this.trackFeature, this.lineBackFeature]);
        } else {
            this.clearDrawing();
        }
        this.trackFeature = feature;
        this.lineBackFeature = feature.clone();
        this.layer.addFeatures([this.lineBackFeature, this.trackFeature]);

        if (!this.active) {
            this.layer.map.zoomToExtent(this.layer.getDataExtent());
        }
    },

    /**
     * Method: editTrack
     */
    editTrack: function() {
        // old track or track with no routing
        if (!this.trackFeature.attributes.via_points) {
            var comps = this.trackFeature.geometry.components;
            for (var i = 0; i < comps.length; i++) {
                var f = new OpenLayers.Feature.Vector(comps[i].clone());
                f.state = OpenLayers.State.INSERT;
                this.layer.addFeatures([f]);
            }
        }
        // track created with the new routing service
        else {
            var viaPts = Ext.util.JSON.decode(
                this.trackFeature.attributes.via_points);
            for (var i = 0; i < viaPts.length; i++) {
                var p = new OpenLayers.Geometry.Point(
                    viaPts[i][0],
                    viaPts[i][1]
                );
                var f = new OpenLayers.Feature.Vector(p);
                f.state = OpenLayers.State.INSERT;
                this.layer.addFeatures([f]);
            }
        }
        this.activate();
    },

    CLASS_NAME: 'VelolandTrack2'
});

VelolandTrack.id = 0;
VelolandTrack.repository = {};

VelolandTrack.chartClick = function(col, row, value, category, series, chartId) {
    var index = (col - 1) / 2;
    VelolandTrack.repository[chartId.replace('_chart', '')].chartClick(index);
};

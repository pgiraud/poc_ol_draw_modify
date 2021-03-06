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
     * Property: layer
     * {OpenLayers.Layer.Vector} The layer in which the via points features are
     *     added. This is the layer with which the controls are configured.
     */
    layer: null,

    /**
     * Property: trackLayer
     * {OpenLayers.Layer.Vector} The layer in which the route line feature is
     *     added.
     */
    trackLayer: null,

    /**
     * Property: trackStyle
     * {Object}
     */
    trackStyle: {
        strokeColor: "red",
        strokeWidth: 3,
        strokeOpacity: 1
    },

    /**
     * Property: trackBgStyle
     * {Object}
     */
    trackBgStyle: {
        strokeColor: "white",
        strokeWidth: 7,
        strokeOpacity: 0.5
    },

    /**
     * Property: styleContext
     * {Object} A context to be used when styling viaPoints. Style may be
     * différence regarding if it's the last point or not.
     */
    styleContext: null,

    /**
     * Method: initialize
     */
    initialize: function(options) {
        OpenLayers.Control.prototype.initialize.apply(this, [options]);

        var self = this;
        this.styleContext = {
            getStrokeColor: function(feature) {
                var vp = self.viaPoints;
                var last = vp[vp.length - 1];
                return (vp.length === 0 || last == feature.geometry) ?
                    'red' : 'white';
            },
            getFillColor: function(feature) {
                var vp = self.viaPoints;
                var last = vp[vp.length - 1];
                return (vp.length === 0 || last == feature.geometry) ?
                    'white' : 'red';
            }
        };

        var style = OpenLayers.Util.applyDefaults({
            strokeOpacity: 1,
            strokeColor: "${getStrokeColor}",
            strokeWidth: 2,
            fillOpacity: 1,
            fillColor: "${getFillColor}"
        }, OpenLayers.Feature.Vector.style['default']);

        var temporaryStyle = OpenLayers.Util.applyDefaults({
            strokeOpacity: 0.8,
            strokeColor: "red",
            strokeWidth: 2,
            fillColor: "white",
            fillOpacity: 0.4,
            pointRadius: 5
        }, OpenLayers.Feature.Vector.style['default']);

        var styleMap = new OpenLayers.StyleMap({
            "default": new OpenLayers.Style(style, {context: this.styleContext}),
            // we don't want to use the temporary directly since it can be changed
            // later
            "temporary": temporaryStyle
        });
        this.layer = new OpenLayers.Layer.Vector('the draw controls layer', {
            rendererOptions: {
                zIndexing: true
            },
            displayInLayerSwitcher: false,
            styleMap: styleMap
        });

        this.trackLayer = new OpenLayers.Layer.Vector('Track layer', {
            displayInLayerSwitcher: false
        });

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
        this.map.addLayers([this.trackLayer, this.layer]);
        this.map.addControls([
            this.drawControl,
            this.clickControl,
            this.dragControl
        ]);
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
                self.drawControl.deactivate();
            },
            onLeave: function(obj) {
                self.drawControl.activate();
            },
            onDrag: function(obj) {
                var style = OpenLayers.Util.applyDefaults({
                    fillOpacity: 0.5,
                    strokeOpacity: 0.5
                }, this.layer.styleMap.styles['default'].defaultStyle);
                style = new OpenLayers.Style(
                    style,
                    {context: self.styleContext}
                );
                obj.style = style.createSymbolizer(obj);

                clearTimeout(self.dragTimeout);
                self.dragTimeout = window.setTimeout(function() {
                    if (self.viaPoints.length >= 2) {
                        self.onTrackModified();
                    }
                }, 100);
            },
            onComplete: function(obj) {
                obj.style = null;
                this.layer.drawFeature(obj);
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
            targets: [this.trackLayer],
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
                this.layer.redraw();
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
                var style = OpenLayers.Util.applyDefaults({
                    fillOpacity: 0.7,
                    strokeOpacity: 0.7,
                    pointRadius: 5
                }, this.layer.styleMap.styles['default'].defaultStyle);
                style = new OpenLayers.Style(
                    style,
                    {context: this.styleContext}
                );

                this.drawControl.handler.style = style.createSymbolizer(obj.point);
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
        this.dirty = true;
        this.events.triggerEvent('trackmodified');
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
            this.trackLayer.removeFeatures([
                this.trackFeature,
                this.lineBackFeature
            ]);
        }
        var line = new OpenLayers.Geometry.LineString(points);
        if (!this.trackFeature) {
            this.trackFeature = new OpenLayers.Feature.Vector(
                line,
                null,
                this.trackStyle
            );
            this.lineBackFeature = new OpenLayers.Feature.Vector(
                line.clone(),
                null,
                this.trackBgStyle
            );
            this.lineBackFeature.background = true;
        } else {
            this.trackFeature.geometry = line;
            this.lineBackFeature.geometry = line.clone();
        }
        this.trackLayer.addFeatures([this.lineBackFeature, this.trackFeature]);
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
        if (typeof index != 'undefined') {
            this.viaPoints.splice(index, 1);
            this.layer.removeFeatures([feature]);
            if (this.viaPoints.length > 1) {
                this.trackLayer.removeFeatures([this.trackFeature,
                                                this.lineBackFeature]);
                this.events.triggerEvent('trackmodified');
                this.onTrackModified();
            }
            this.layer.redraw();
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
        this.trackLayer.removeFeatures(this.trackLayer.features);
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
            this.trackLayer.removeFeatures([
                this.trackFeature,
                this.lineBackFeature
            ]);
        } else {
            this.clearDrawing();
        }
        this.trackFeature = feature;
        this.trackFeature.style = this.trackStyle;
        this.lineBackFeature = feature.clone();
        this.lineBackFeature.style = this.trackBgStyle;
        this.trackLayer.addFeatures([this.lineBackFeature, this.trackFeature]);

        if (!this.active) {
            this.map.zoomToExtent(this.trackLayer.getDataExtent());
        }
    },

    /**
     * Method: editTrack
     */
    editTrack: function() {
        var points = [];

        // old track
        if (!this.trackFeature.attributes.via_points) {
            var comps = this.trackFeature.geometry.components;
            for (var i = 0; i < comps.length; i++) {
                var f = new OpenLayers.Feature.Vector(comps[i].clone());
                f.state = OpenLayers.State.INSERT;
                points.push(f);
            }
        }
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
                points.push(f);
            }
        }

        for (var i = 0; i < points.length; i++) {
            this.viaPoints.push(points[i].geometry);
        }

        this.layer.addFeatures(points, { silent: true });
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

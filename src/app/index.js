import L from 'leaflet';
import $ from 'jquery';

var MAX_TAGS_PER_TILE = 10;
var TILE_PADDING_WIDTH = 10;
var TILE_PADDING_HEIGHT = 24;
var FONT_SIZING_METHOD_LOG = "log";
var MIN_FONT = 10;
var MAX_FONT = 20;

var GROUPBY_API_URL = "https://xyz-cors.groupbycloud.com/wisdom/v2/public/recommendations/searches/_getPopular";
var HOSTNAME_FILTER = 'www.xyz.com';

var updateWordPosition = function(wordPos) {
    var diameter = 2 * Math.PI * wordPos.radius;
    var arcLen = (wordPos.arcLength > diameter / 10) ? diameter / 10 : wordPos.arcLength;
    var angle = arcLen / wordPos.radius;
    var newAngle = wordPos.t + angle;
    if(newAngle > 2 * Math.PI){
    	newAngle %= 2 * Math.PI;
    	wordPos.radius = wordPos.radius + wordPos.radiusInc;
    }
    wordPos.t = newAngle;
    wordPos.x = wordPos.radius * Math.cos(newAngle);
    wordPos.y = wordPos.radius * Math.sin(newAngle);
    return wordPos;
};

var overlapsLabel = function(candidate, spec) {
    return 	2 * Math.abs(candidate.x - spec.x) < candidate.width + spec.width && 
    		2 * Math.abs(candidate.y - spec.y) < candidate.height + spec.height;
};

var outsideBounds = function(label, bbox) {
    return label.x + label.width / 2 > bbox.x + bbox.width / 2 || 
    	label.x - label.width / 2 < bbox.x - bbox.width / 2 || 
    	label.y + label.height / 2 > bbox.y + bbox.height / 2 || 
    	label.y - label.height / 2 < bbox.y - bbox.height / 2;
};

var collides = function(wordPosition, wordSize, labelSpecs, labelBoundingBox) {
    var candidateLabel = {
        x: wordPosition.x,
        y: wordPosition.y,
        height: wordSize.height,
        width: wordSize.width
    };
    for (var i = 0; i < labelSpecs.length; i++){
        if (overlapsLabel(candidateLabel, labelSpecs[i])) return true;
    }
    if(outsideBounds(candidateLabel, labelBoundingBox)){
    	wordPosition.collisions++;
    	wordPosition.arcLength = wordPosition.radius;
    	return true;
    }
    return false;
};

var getWordSize = function(word, fontSize) {
    var size = {};
    var div = $('<div class="word-cloud-label-temp" style="font-size:' + fontSize + 'px;">' + word + "</div>");
    $("body").append(div);
    size.width = div.outerWidth();
    size.height = div.outerHeight();
    div.remove();
    return size;
};

var getFontSizeFactor = function(frequency, min, max, method) {
    var clampedFreq = Math.max(Math.min(frequency, max), min);
    if ("log" === method) {
        var logMin = Math.log10(min || 1);
        var logMax = Math.log10(max || 1);
        var h = 1 / (logMax - logMin || 1);
        return (Math.log10(clampedFreq || 1) - logMin) * h;
    }
    var delta = max - min;
    return (clampedFreq - min) / delta;
};

var getFontSize = function(frequency, levelMinFreq, levelMaxFreq, fontSpec) {
    fontSpec = fontSpec || {};
    var max = fontSpec.maxFontSize || 22;
    var min = fontSpec.minFontSize || 12;
    var sizeFactor = getFontSizeFactor(frequency, levelMinFreq, levelMaxFreq, fontSpec.type);
    return min + sizeFactor * (max - min);
};

var tagsToLabelSpecs = function(tags, levelMinFreq, levelMaxFreq, fontSizingMethod, minFont, maxFont) {

    var wordBoundingBox = {
        width: 256 - 2 * TILE_PADDING_WIDTH,
        height: 256 - 2 * TILE_PADDING_HEIGHT,
        x: 0,
        y: 0
    };

    var tagsByFreq = tags.sort(function(tagA, tagB) {
        return tagB.count - tagA.count;
    });

    var labelSpecs = [];
    for (var i = 0; i < tagsByFreq.length; i++) {
        var word = tagsByFreq[i].text;
        var freq = tagsByFreq[i].count;
        var fontSize = getFontSize(freq, levelMinFreq, levelMaxFreq, {
            maxFontSize: maxFont,
            minFontSize: minFont,
            type: fontSizingMethod
        });
        var fontScale = 100 * getFontSizeFactor(freq, levelMinFreq, levelMaxFreq, fontSizingMethod);
        var wordSize = getWordSize(word, fontSize);
        var wordPosition = {
            radius: 1,
            radiusInc: 5,
            arcLength: 5,
            x: 0,
            y: 0,
            t: 0,
            collisions: 0
        };
        for (var numTags = tagsByFreq.length; wordPosition.collisions < numTags; ){
        	wordPosition = updateWordPosition(wordPosition);
            if (!collides(wordPosition, wordSize, labelSpecs, wordBoundingBox)) {
                labelSpecs.push({
                    word: word,
                    entry: tagsByFreq[i].entry,
                    fontSize: fontSize,
                    percentLabel: 10 * Math.round(fontScale / 10),
                    x: wordPosition.x,
                    y: wordPosition.y,
                    width: wordSize.width,
                    height: wordSize.height
                });
                break;
            }
        }
    }
    return labelSpecs;
};

var renderTile = function(jqTile, tileData, level, highlightedWord) {
    var labelSpecs;
    var numTags = Math.min(tileData.tags ? tileData.tags.length : 0, MAX_TAGS_PER_TILE);
    var wordCloud = $("<div></div>");
    var tags = tileData.tags;
    if (numTags > 0) {
        labelSpecs = tagsToLabelSpecs(tags, level.min, level.max, FONT_SIZING_METHOD_LOG, MIN_FONT, MAX_FONT);
        var countSummary = $('<div class="count-summary"></div>');
        wordCloud = wordCloud.append(countSummary);
        labelSpecs.forEach(function(spec) {
            var label = $('<div class="word-cloud-label word-cloud-label-' + spec.percentLabel + '" style="font-size:' + spec.fontSize + "px;left:" + (128 + spec.x - spec.width / 2) + "px;top:" + (128 + spec.y - spec.height / 2) + "px;width:" + spec.width + "px;height:" + spec.height + 'px;"data-word="' + spec.word + '">' + spec.word + "</div>");
            if(spec.word === highlightedWord) label.addClass("highlight");
            wordCloud = wordCloud.append(label);
        });
        jqTile.html(wordCloud);
    }
};

L.WordcloudLayer = L.TileLayer.extend({
    options: {
        async: true,
        tms: true,
        unloadInvisibleTiles: true,
        noWrap: true
    },
    initialize: function(url, opts) {
        this._url = url;
        L.setOptions(this, opts);
    },
    onAdd: function(tile) {
        var layer = this;
        L.TileLayer.prototype.onAdd.call(this, tile);
        tile.on("zoomend", this.onZoom, this);
        tile.on("click", this.onClick, this);
        $(this._container).on("mouseover", function(tile) {
            layer.onHover(tile);
        });
    },
    onRemove: function(tile) {
        tile.off("zoomend", this.onZoom);
        tile.off("click", this.onClick);
        $(this._container).off("mouseover");
        this.highlight = null;
        L.TileLayer.prototype.onRemove.call(this, tile);
    },
    onZoom: function() {
        $(this._container).removeClass("highlight");
        this.highlight = null;
    },
    onHover: function(event) {
        var target = $(event.originalEvent.target);
        $(".word-cloud-label").removeClass("hover");
        var word = target.attr("data-word");
        if(word){
        	$(".word-cloud-label[data-word=" + word + "]").addClass("hover");
        }
    },
    onClick: function(event) {
        var target = $(event.originalEvent.target);
        $(".word-cloud-label").removeClass("highlight");
        var word = target.attr("data-word");
        if(word){
            $(this._container).addClass("highlight");
            $(".word-cloud-label[data-word=" + word + "]").addClass("highlight");
            this.highlight = word;
        } else {
        	$(this._container).removeClass("highlight");
        	this.highlight = null;
    	}
    },
    redraw: function() {
        if(this._map){
        	this._reset({ hard: true });
        	this._update();
        }
        for (var t in this._tiles)
            this._redrawTile(this._tiles[t]);
        return this;
    },
    _redrawTile: function(tile) {
        this.drawTile(tile, tile._tilePoint, this._map._zoom);
    },
    _createTile: function() {
        var tile = L.DomUtil.create("div", "leaflet-tile leaflet-wordcloud");
        tile.width = tile.height = this.options.tileSize;
        tile.onselectstart = tile.onmousemove = L.Util.falseFn;
        return tile;
    },
    _loadTile: function(tile, point) {
        tile._layer = this;
        tile._tilePoint = point;
        this._adjustTilePoint(point);
        this._redrawTile(tile);
        if(!this.options.async){ 
        	this.tileDrawn(tile);
        }
    },
    getTileUrl: function(coords) {
        return GROUPBY_API_URL;
    },        
    drawTile: function(tileElem, coords, level) {
        var layer = this;
        var url = this.getTileUrl(coords);
        var tileZone = getTileZone(coords);
        var processResponse = function(data){

        	var tileData = {
        		index: { 
        			level : coords.z,
        			xIndex : coords.x,
        			yIndex : coords.y
        		},
        		max: "50",
        		min: "1",
        		tags: data.result.map( r => { 
        			//clean text
        			var term = r.query.split(" ").join("_");
        			term = term.split("'").join("_");
        			return { text: term, count: r.count }; })
        	};

            var tile = $(tileElem).empty();
            renderTile(tile, tileData, layer.options.dataExtents[level], layer.highlight);
            layer.tileDrawn(tileElem);
        };
        //$.post(url, getPostData(tileZone)).then(processResponse);
        var dummyData = {"status":{"code":200,"message":"OK","additionalInfo":null},"result":[{"query":"hair bleach","count":73},{"query":"dog","count":501},{"query":"milani","count":101},{"query":"paper towels","count":9},{"query":"childrens mucinex","count":7},{"query":"humidifier","count":6},{"query":"lice","count":6},{"query":"revlon colorsilk","count":6},{"query":"sheamoisture bar","count":6},{"query":"always discreet","count":5}],"serverTimestamp":"2017-03-05T20:12:21+00:00"};
        processResponse(dummyData);

    },
    tileDrawn: function(tile) {
        this._tileOnLoad.call(tile);
    },
    refresh: function() {}
});

var map = new L.Map("map",{
    zoomControl: true,
    center: [37.7528, -100.0171],
    zoom: 5,
    minZoom: 4,
    maxZoom: 10,
    scrollWheelZoom: false
});


var getTileZone = function(tileCoord){
	var zoom = map.getZoom();
	var maxY = 2**zoom*256;
	var coordLatLngCenter = map.unproject( L.point( (tileCoord.x+0.5)*256, maxY-(tileCoord.y+0.5)*256) );
	var coordLatLngBottomLeft = map.unproject( L.point( (tileCoord.x)*256, maxY-(tileCoord.y+1)*256) );
	var radius = coordLatLngCenter.distanceTo(coordLatLngBottomLeft);
	return( { lat: coordLatLngCenter.lat, lon: coordLatLngCenter.lng, radius : radius/1000 } );
};

var getPostData = function(zone){

	const postData = {
	  "size": 10,
	  "window": "week",
	  "matchExact": {
	    "and": [
	      {
	        "visit": {
	          "generated": {
	            "geo": {
	              "location": {
	                "distance": `${zone.radius}km`,
	                "center": {
	                  "lat": zone.lat,
	                  "lon": zone.lon
	                }
	              }
	            },
	            "parsedUri": {
	              "hostname": HOSTNAME_FILTER
	            }
	          }
	        }
	      }
	    ]
	  }
	};
	return JSON.stringify(postData);

};


map.attributionControl.setPrefix('<a href="http://leafletjs.com" target="_top">Leaflet</a>'),
L.tileLayer("//cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png", {
    attribution: "CartoDB"
}).addTo(map);
var attribution = '<a href="http://www.groupbyinc.com/">GroupBy</a>';
var words = new L.WordcloudLayer("//s3.amazonaws.com/embed.pantera.io/saltdemos/taxi-twitter/nyc-twitter-hashtags/{z}/{x}/{y}.json",{
    attribution: attribution,
    dataExtents: {
        4: {
            min: 1,
            max: 400
        },
        5: {
            min: 1,
            max: 300
        },
        6: {
            min: 1,
            max: 200
        },
        7: {
            min: 1,
            max: 100
        },
        8: {
            min: 1,
            max: 75
        },
        9: {
            min: 1,
            max: 50
        },
        10: {
            min: 1,
            max: 30
        }
    }
});
words.addTo(map),
L.control.layers({}, {
    "Popular Search Terms": words
}, {
    collapsed: false
}).addTo(map);

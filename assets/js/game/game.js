/* Create game object to hold the display and initialize game */
let Game = {
    overview: null,
    display: null,
    HUD: null,
    console: null,
    player: null,
    playerStart: null,
    scheduler: null,
    engine: null,
    levels: {},
    currentLevel: "expanded_start",
    map: null,
    message_history: [["Welcome to Rotten Soup", "yellow"]],
    minimap: null,
    visible_tiles: {},
    seen_tiles: {},
    map_revealed: true,

    init: function () {
        this.map = new Map(TileMaps["expanded_start"]);
        this.levels["expanded_start"] = this.map;
        this.levels["dungeon1"] = new Map(randomMap(50,50));
        this.playerStart = this.map.playerStart;
        // this.map = new Map(randomMap(50,50));
        // Set up the ROT.JS game display
        let options = {
            width: 38.75,
            height: 30,
            fontSize: 17,
            fontFamily: "inconsolata",
            // fontStyle: "bold",
            spacing: 1.0,
            forceSquareRatio: true
        };
        this.width = options.width;
        this.height = options.height;
        this.display = new ROT.Display(options);
        console.log(this.playerStart);
        this.player = new Player(this.playerStart[0], this.playerStart[1]);
        this.map.actors.push(this.player); // add to the list of all actors
        this.map.data[this.playerStart[1]][this.playerStart[0]].actors.push(this.player); // also push to the tiles' actors
        this.scheduleAllActors();
        this.drawViewPort();
        this.initializeMinimap();
    },

    scheduleAllActors: function() {
        // Set up the ROT engine and scheduler
        this.scheduler = new ROT.Scheduler.Simple();
        this.scheduler.add(this.player, true); // Add the player to the scheduler
        for (let i = 0; i < this.map.actors.length; i++) {
            if (this.map.actors[i] !== this.player) {
                this.scheduler.add(this.map.actors[i], true);
            }
        }
        this.engine = new ROT.Engine(this.scheduler); // Create new engine with the newly created scheduler
        this.engine.start(); // Start the engine
    },

    initializeMinimap: function () {
        /* Create a ROT.JS display for the minimap! */
        this.minimap = new ROT.Display({
            width: this.map.width, height: this.map.height, fontSize:5, spacing:1.0, forceSquareRatio: true
        });
        this.drawMiniMap();
    },

    log: function(message, type) {
        let message_color = {
            'defend': 'blue',
            'attack': 'red',
            'death': 'crimson',
            'information': 'yellow',
            'player_move': 'grey',
            'level_up': 'green',
            'alert': 'orange',
        };
        this.message_history.push([message, message_color[type]]);
        $('#fix_scroll').stop().animate({
            scrollTop: $('#fix_scroll')[0].scrollHeight
        }, 800);
    },

    inbounds: function (x, y) {
        return !(x < 0 || x >= this.map.width || y < 0 || y >= this.map.height);
    },

    /* TODO: Find a way to change the map - its actors - while preserving the player object. */
    changeLevels: function (newLevel) {
        // Save the old map
        this.levels[this.currentLevel] = this.map; // add the old map to 'levels'
        // Add the new map to the game
        this.map = this.levels[newLevel];
        this.playerStart = this.map.playerStart;
        console.log(this.playerStart);
        this.player.tryMove(this.playerStart[0], this.playerStart[1]);
        this.scheduleAllActors();
        this.drawViewPort();
        this.initializeMinimap();
        $('#minimap_container').html(this.minimap.getContainer()); // resetting the canvas / minimap display fixes ghosting

    },

    drawViewPort: function () {
        // Clear the last visible tiles that were available to be seen
        Object.assign(this.seen_tiles, this.visible_tiles);
        this.visible_tiles = {};
        /* FOV Computation */
        let fov = new ROT.FOV.PreciseShadowcasting(function(x,y) {
            return (Game.inbounds(x,y) && Game.map.data[y][x].options.visible);
        });

        fov.compute(this.player.x, this.player.y, 10, function(x, y, r, visibility) {
            Game.visible_tiles[x + ',' + y] = true;
        });

        let camera = { // camera x,y resides in the upper left corner
            x: this.player.x - Math.floor(Game.width / 2),
            y: this.player.y - Math.floor(Game.height / 2),
            width: Math.ceil(Game.width),
            height: Game.height,
        };
        let startingPos = [camera.x, camera.y];
        if (camera.x < 0) // far left
            startingPos[0] = 0;
        if (camera.x + camera.width > Game.map.width) // far right
            startingPos[0] = Game.map.width - camera.width;
        if (camera.y <= 0) // at the top of the map
            startingPos[1] = 0;
        if (camera.y + camera.height > Game.map.height) { // at the bottom of the map
            startingPos[1] = Game.map.height - camera.height;
        }
        let endingPos = [startingPos[0] + camera.width, startingPos[1] + camera.height];
        let dx = 0;
        let dy = 0;
        for (let x = startingPos[0]; x < endingPos[0]; x++) {
            for (let y = startingPos[1]; y < endingPos[1]; y++) {
                let tile = this.map.data[y][x];
                if (tile.x + "," + tile.y in this.visible_tiles) {
                    this.drawFirstActor(dx, dy++, tile);
                } else {
                    this.drawDimTile(dx,dy++, tile);
                }
            }
            dx++;
            dy = 0;
        }
    },

    drawDimTile: function(x, y, tile) {
        let color = tile.options.fg;
        let hsl_color = ROT.Color.rgb2hsl(ROT.Color.fromString(color));
        hsl_color[2] *= .25;
        color = ROT.Color.hsl2rgb(hsl_color);
        Game.display.draw(x, y, tile.symbol, ROT.Color.toRGB(color), "black");
    },

    drawTile: function (x, y, tile) {
        Game.display.draw(x, y, tile.symbol, tile.options.fg, "black");
    },

    drawFirstActor: function (x, y, tile) {
        if (! tile) { console.log( x + ',' + y);}
        for (let i = 0; i < tile.actors.length; i++) {
            if (tile.actors[i].options.visible) {
                Game.drawTile(x, y, tile);
                Game.drawActor(x, y, tile.actors[i]);
                return;
            }
        }
        // if we reach this point, no actors were drawable
        Game.drawTile(x, y, tile);
    },

    drawActor: function (x, y, actor) {
        Game.display.draw(x, y, actor.options.symbol, actor.options.fg, "black");
    },

    drawMiniMap: function () {
        for (let y = 0; y < this.map.height; y++) {
            for (let x = 0; x < this.map.width; x++) {
                let tile = this.map.data[y][x];
                if (this.map_revealed || (tile.x + ',' + tile.y in this.seen_tiles))
                    if (tile.x + ',' + tile.y in this.visible_tiles)
                        this.minimap.draw(x, y, " ", tile.options.fg, this.brightenColor(tile.options.bg));
                    else
                        this.minimap.draw(x, y, " ", tile.options.fg, tile.options.bg);
            }
        }

        // Draw the actor in the mini-map
        this.minimap.draw(this.player.x, this.player.y, "@", this.player.fg, "yellow");
    },

    brightenColor: function(color) {
        let hsl_color = ROT.Color.rgb2hsl(ROT.Color.fromString(color));
        hsl_color[2] *= 1.5;
        return  ROT.Color.toRGB(ROT.Color.hsl2rgb(hsl_color));
    }
};

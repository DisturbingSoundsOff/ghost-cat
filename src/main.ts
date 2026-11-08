import Phaser from "phaser";

// ---------------------------------------------------------------- constants
const W = 1000;
const H = 650;
const TILE = 64;
const PLAYER_SPEED = 300; // 5 px/frame * 60 fps
const MONSTER_SPEED = 120; // 2 px/frame * 60 fps

// Level files in public/assets/Levels/ (without .json). Level N = LEVEL_FILES[N-1].
// Add "MLevel1" etc. here if you want to use those instead.
const LEVEL_FILES = ["Level1", "Level2", "Level3"];
const LAST_LEVEL = LEVEL_FILES.length;

const ASSETS = "assets/";
const SLIDES = `${ASSETS}Slides/`; // intro/level/death/win images (not in your tree yet, see notes)

// sound key -> file name (without extension) in assets/Sounds/
const SOUNDS: Record<string, string> = {
	cutscene: "cutscene",
	lose: "you-lost-ending",
	upgrade: "UpGrade",
	downgrade: "DownGrade4",
	take_sword: "took-sword",
	attack: "sword-hit",
	coin: "Coin",
};

// left, right, up, down
const DIRS = [
	{ x: -1, y: 0 },
	{ x: 1, y: 0 },
	{ x: 0, y: -1 },
	{ x: 0, y: 1 },
];

type Point = { x: number; y: number };

// Minimal shape of the Tiled JSON we read ourselves
type TiledTileset = {
	firstgid: number;
	name: string;
	source?: string;
	image?: string;
	tilewidth: number;
	tileheight: number;
	margin?: number;
	spacing?: number;
	tiles?: { id: number; image?: string }[];
};

// Tiled image paths are relative to the .json file, so resolve them to absolute
// URLs. The URL doubles as the Phaser texture key.
const levelUrl = (file: string) => new URL(`${ASSETS}Levels/${file}.json`, document.baseURI);
const resolveImage = (img: string, file: string) =>
	new URL(img.replace(/\\/g, "/"), levelUrl(file)).href;

// One generic "press ENTER to continue" scene replaces Intro / changeLevel /
// deathScreen / finishScreen. `next` is either a scene key or more slide data.
type SlideData = {
	frames: string[];
	music?: string;
	loop?: boolean;
	next: string | SlideData;
	resetLevel?: boolean;
};

const levelTitle = (n: number): SlideData => ({ frames: [`level${n}`], next: "Game" });
const introData: SlideData = {
	frames: Array.from({ length: 8 }, (_, i) => `intro${i + 1}`),
	music: "cutscene",
	next: levelTitle(1),
};
const deathData: SlideData = { frames: ["death"], music: "lose", loop: true, next: "Game" };
const finishData: SlideData = {
	frames: ["win1", "win2"],
	music: "lose",
	next: "Game",
	resetLevel: true,
};

// ---------------------------------------------------------------- Boot
// Loads everything. Tileset images can only be queued once the level JSON is
// loaded (that's where their paths live), so loading happens in two passes.
// Also waits for a key press, because browsers block audio until interaction.
class Boot extends Phaser.Scene {
	constructor() {
		super("Boot");
	}

	preload() {
		this.add.text(W / 2, H / 2, "Loading...", { fontSize: "24px" }).setOrigin(0.5);

		// slides
		for (let i = 1; i <= 8; i++) this.load.image(`intro${i}`, `${SLIDES}intro_${i}.png`);
		for (let i = 1; i <= LAST_LEVEL; i++) this.load.image(`level${i}`, `${SLIDES}level_${i}.png`);
		this.load.image("death", `${SLIDES}death.png`);
		this.load.image("win1", `${SLIDES}win_1.png`);
		this.load.image("win2", `${SLIDES}win_2.png`);

		// levels + level music
		LEVEL_FILES.forEach((file, i) => {
			this.load.tilemapTiledJSON(`level${i + 1}`, levelUrl(file).href);
			this.load.audio(`level${i + 1}`, `${ASSETS}Sounds/Level${i + 1}.ogg`);
		});

		// sprites
		const s = `${ASSETS}Sprites/`;
		this.load.image("ghost", `${s}ghost.png`);
		this.load.image("ghost_sword", `${s}ghost-sword1.png`);
		this.load.image("cat", `${s}cat.png`);
		this.load.image("cat_sword", `${s}cat-sword2.png`);
		this.load.image("monster", `${s}monster64.png`);
		this.load.image("coin_small", `${s}small-coin.png`);
		this.load.image("sword", `${s}sword.png`);

		// sound effects
		for (const [key, file] of Object.entries(SOUNDS)) {
			this.load.audio(key, `${ASSETS}Sounds/${file}.ogg`);
		}
	}

	create() {
		this.registry.set("level", 1);
		this.queueTilesetImages();
		if (this.load.list.size === 0 && this.load.inflight.size === 0) this.ready();
		else {
			this.load.once(Phaser.Loader.Events.COMPLETE, () => this.ready());
			this.load.start();
		}
	}

	private queueTilesetImages() {
		const queued = new Set<string>();
		LEVEL_FILES.forEach((file, i) => {
			const raw = this.cache.tilemap.get(`level${i + 1}`)?.data;
			if (!raw) return;
			for (const ts of raw.tilesets as TiledTileset[]) {
				if (ts.source) {
					console.warn(`${file}: external tileset "${ts.source}" is not supported. Embed it in Tiled.`);
					continue;
				}
				if (ts.image) {
					// one big image cut into tiles
					const url = resolveImage(ts.image, file);
					if (queued.has(url)) continue;
					queued.add(url);
					this.load.spritesheet(url, url, {
						frameWidth: ts.tilewidth,
						frameHeight: ts.tileheight,
						margin: ts.margin ?? 0,
						spacing: ts.spacing ?? 0,
					});
				} else {
					// "collection of images" tileset: one file per tile
					for (const t of ts.tiles ?? []) {
						if (!t.image) continue;
						const url = resolveImage(t.image, file);
						if (queued.has(url)) continue;
						queued.add(url);
						this.load.image(url, url);
					}
				}
			}
		});
	}

	private ready() {
		this.add.rectangle(W / 2, H / 2, W, H, 0x000000);
		this.add.text(W / 2, H / 2, "Press any key to start", { fontSize: "28px" }).setOrigin(0.5);
		this.input.keyboard!.once("keydown", () => this.scene.start("Slides", introData));
	}
}

// ---------------------------------------------------------------- Slides
class Slides extends Phaser.Scene {
	private data_!: SlideData;
	private idx = 0;
	private img!: Phaser.GameObjects.Image;
	private music?: Phaser.Sound.BaseSound;

	constructor() {
		super("Slides");
	}

	init(data: SlideData) {
		this.data_ = data;
		this.idx = 0;
	}

	create() {
		this.img = this.add.image(W / 2, H / 2, this.data_.frames[0]).setScale(0.5);
		if (this.data_.music) {
			this.music = this.sound.add(this.data_.music, { loop: !!this.data_.loop });
			this.music.play();
		}
		this.input.keyboard!.on("keydown-ENTER", () => this.advance());
	}

	private advance() {
		this.idx++;
		if (this.idx < this.data_.frames.length) {
			this.img.setTexture(this.data_.frames[this.idx]);
			return;
		}
		this.music?.stop();
		if (this.data_.resetLevel) this.registry.set("level", 1);
		const next = this.data_.next;
		if (typeof next === "string") this.scene.start(next);
		else this.scene.start("Slides", next);
	}
}

// ---------------------------------------------------------------- Player
class Player extends Phaser.Physics.Arcade.Sprite {
	hasSword = false;
	isCat = false;
	private facingRight = true;

	constructor(scene: Phaser.Scene, x: number, y: number) {
		super(scene, x, y, "ghost");
		scene.add.existing(this);
		scene.physics.add.existing(this);
		this.setScale(0.9).setDepth(1000);
	}

	refresh(dx = 0) {
		if (dx < 0) this.facingRight = false;
		else if (dx > 0) this.facingRight = true;
		const key = (this.isCat ? "cat" : "ghost") + (this.hasSword ? "_sword" : "");
		this.setTexture(key);
		this.setFlipX(this.facingRight); // flip if your art faces the other way
		(this.body as Phaser.Physics.Arcade.Body).setSize(this.width, this.height);
	}
}

// ---------------------------------------------------------------- Monster
// Moves tile to tile. On arriving at a tile centre it checks for a wall ahead
// and, if blocked, turns perpendicular (or reverses if both sides are blocked).
class Monster extends Phaser.Physics.Arcade.Sprite {
	private dir = 2; // start moving up
	private target = new Phaser.Math.Vector2();
	private isBlocked: (x: number, y: number, dir: number) => boolean;

	constructor(
		scene: Phaser.Scene,
		x: number,
		y: number,
		isBlocked: (x: number, y: number, dir: number) => boolean
	) {
		super(scene, x, y, "monster");
		this.isBlocked = isBlocked;
		scene.add.existing(this);
		scene.physics.add.existing(this);
		this.setDepth(900);
	}

	begin() {
		this.chooseDir();
		this.setTarget();
	}

	private chooseDir() {
		if (!this.isBlocked(this.x, this.y, this.dir)) return;
		const options = this.dir < 2 ? [2, 3] : [0, 1];
		const free = options.filter((d) => !this.isBlocked(this.x, this.y, d));
		this.dir = free.length ? Phaser.Utils.Array.GetRandom(free) : this.dir ^ 1;
	}

	private setTarget() {
		const d = DIRS[this.dir];
		this.target.set(this.x + d.x * TILE, this.y + d.y * TILE);
		this.setVelocity(d.x * MONSTER_SPEED, d.y * MONSTER_SPEED);
		this.setFlipX(this.dir === 0);
	}

	preUpdate(time: number, delta: number) {
		super.preUpdate(time, delta);
		const d = DIRS[this.dir];
		const reached =
			(d.x < 0 && this.x <= this.target.x) ||
			(d.x > 0 && this.x >= this.target.x) ||
			(d.y < 0 && this.y <= this.target.y) ||
			(d.y > 0 && this.y >= this.target.y);
		if (reached) {
			this.setPosition(this.target.x, this.target.y);
			this.chooseDir();
			this.setTarget();
		}
	}
}

// ---------------------------------------------------------------- Game
class Game extends Phaser.Scene {
	private level = 1;
	private levelFile = "";
	private map!: Phaser.Tilemaps.Tilemap;
	private tilesets: TiledTileset[] = [];
	private player!: Player;
	private walls!: Phaser.Physics.Arcade.StaticGroup;
	private coins!: Phaser.Physics.Arcade.StaticGroup;
	private swords!: Phaser.Physics.Arcade.StaticGroup;
	private cats!: Phaser.Physics.Arcade.StaticGroup;
	private monsters!: Phaser.GameObjects.Group;
	private blocked = new Set<string>(); // "tx,ty" of every wall tile
	private catSpawns: Point[] = [];
	private monsterSpawns: Point[] = [];
	private finish: Point = { x: 0, y: 0 };
	private coinsCollected = 0;
	private coinsTotal = 0;
	private hud!: Phaser.GameObjects.Text;
	private music!: Phaser.Sound.BaseSound;
	private keys!: Record<string, Phaser.Input.Keyboard.Key>;
	private ended = false;

	constructor() {
		super("Game");
	}

	create() {
		this.level = this.registry.get("level");
		this.levelFile = LEVEL_FILES[this.level - 1];
		this.ended = false;
		this.coinsCollected = 0;
		this.blocked.clear();
		this.catSpawns = [];
		this.monsterSpawns = [];

		this.map = this.make.tilemap({ key: `level${this.level}` });
		this.tilesets = this.cache.tilemap.get(`level${this.level}`).data.tilesets;

		this.music = this.sound.add(`level${this.level}`, { volume: 0.1, loop: true });
		this.music.play();
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.music.destroy());

		this.walls = this.physics.add.staticGroup();
		this.coins = this.physics.add.staticGroup();
		this.swords = this.physics.add.staticGroup();
		this.cats = this.physics.add.staticGroup();
		this.monsters = this.add.group();

		this.buildLevel();

		this.player = new Player(this, this.finish.x, this.finish.y);
		this.physics.add.collider(this.player, this.walls);

		this.coinsTotal = this.coins.getLength();
		this.respawnCat();
		this.monsterSpawns.forEach((p) => {
			const m = new Monster(this, p.x, p.y, (x, y, d) => this.isBlocked(x, y, d));
			this.monsters.add(m);
			m.begin();
		});

		// --- overlaps ---
		this.physics.add.overlap(this.player, this.coins, (_p, c) => {
			c.destroy();
			this.sound.play("coin");
			this.coinsCollected++;
			this.updateHud();
		});
		this.physics.add.overlap(this.player, this.cats, (_p, c) => {
			c.destroy();
			this.player.isCat = true;
			this.sound.play("upgrade");
		});
		this.physics.add.overlap(this.player, this.swords, (_p, s) => {
			s.destroy();
			this.player.hasSword = true;
			this.sound.play("take_sword");
		});
		this.physics.add.overlap(this.player, this.monsters, (_p, m) => this.onMonster(m as Monster));

		// --- camera + HUD ---
		const cam = this.cameras.main;
		cam.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
		cam.startFollow(this.player);

		this.add.image(W - 150, 17, "coin_small").setScrollFactor(0).setDepth(2000);
		this.hud = this.add
			.text(W - 125, 5, "", { fontSize: "18px", fontStyle: "bold", color: "#fff" })
			.setScrollFactor(0)
			.setDepth(2000);
		this.updateHud();

		// --- input ---
		const kb = this.input.keyboard!;
		this.keys = kb.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT") as Record<string, Phaser.Input.Keyboard.Key>;
		kb.on("keydown-R", () => this.scene.restart());
		kb.on("keydown-T", () => this.win()); // debug: skip level
	}

	// Walks every tile layer in order (like Arcade's scene.draw()):
	//  - special layers become gameplay objects
	//  - "Blocks" is drawn and gets colliders
	//  - any other layer (floor, decoration...) is just drawn
	private buildLevel() {
		this.map.layers.forEach((layer, order) => {
			for (const row of layer.data) {
				for (const tile of row) {
					if (tile.index <= 0) continue;
					const px = tile.x * TILE;
					const py = tile.y * TILE;
					const cx = px + TILE / 2;
					const cy = py + TILE / 2;
					const tex = this.tileTexture(tile.index);

					switch (layer.name) {
						case "SpawnPlayer":
							this.finish = { x: cx, y: cy };
							break;
						case "Cat":
							this.catSpawns.push({ x: cx, y: cy });
							break;
						case "Monster":
							this.monsterSpawns.push({ x: cx, y: cy });
							break;
						case "Coins":
							this.coins
								.create(cx, cy, tex?.key ?? "coin_small", tex?.frame)
								.setDepth(order);
							break;
						case "Sword":
							this.swords
								.create(cx, cy, tex?.key ?? "sword", tex?.frame)
								.setDepth(order);
							break;
						case "Blocks":
							if (tex) {
								// Tiled aligns tile images to the bottom-left of the cell
								const w = this.walls.create(px, py + TILE, tex.key, tex.frame);
								w.setOrigin(0, 1).setDepth(order).refreshBody();
							}
							this.blocked.add(`${tile.x},${tile.y}`);
							break;
						default:
							if (tex) this.add.image(px, py + TILE, tex.key, tex.frame).setOrigin(0, 1).setDepth(order);
					}
				}
			}
		});
	}

	// gid -> texture key (+ frame) of the image Boot loaded for that tile
	private tileTexture(gid: number): { key: string; frame?: number } | null {
		let ts: TiledTileset | undefined;
		for (const t of this.tilesets) {
			if (t.firstgid <= gid && (!ts || t.firstgid > ts.firstgid)) ts = t;
		}
		if (!ts) return null;
		const local = gid - ts.firstgid;
		if (ts.image) return { key: resolveImage(ts.image, this.levelFile), frame: local };
		const t = ts.tiles?.find((x) => x.id === local);
		return t?.image ? { key: resolveImage(t.image, this.levelFile) } : null;
	}

	update() {
		if (this.ended) return;
		const k = this.keys;
		const dx = (k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0);
		const dy = (k.DOWN.isDown || k.S.isDown ? 1 : 0) - (k.UP.isDown || k.W.isDown ? 1 : 0);
		this.player.setVelocity(dx * PLAYER_SPEED, dy * PLAYER_SPEED);
		this.player.refresh(dx);

		if (
			this.coinsCollected === this.coinsTotal &&
			this.player.isCat &&
			Math.abs(this.player.x - this.finish.x) < TILE &&
			Math.abs(this.player.y - this.finish.y) < TILE
		) {
			this.win();
		}
	}

	private onMonster(m: Monster) {
		if (this.ended) return;
		if (this.player.hasSword) {
			m.destroy();
			this.sound.play("attack");
			this.player.hasSword = false;
		} else if (this.player.isCat) {
			m.destroy();
			this.sound.play("downgrade");
			this.player.isCat = false;
			this.respawnCat();
		} else {
			this.ended = true;
			this.scene.start("Slides", deathData);
		}
	}

	private win() {
		if (this.ended) return;
		this.ended = true;
		const next = this.level + 1;
		this.registry.set("level", next);
		this.scene.start("Slides", next <= LAST_LEVEL ? levelTitle(next) : finishData);
	}

	private respawnCat() {
		if (!this.catSpawns.length) return;
		const p = Phaser.Utils.Array.GetRandom(this.catSpawns);
		this.cats.create(p.x, p.y, "cat").setDepth(500);
	}

	private updateHud() {
		this.hud.setText(`Coins: ${this.coinsCollected}/${this.coinsTotal}`);
	}

	private isBlocked(x: number, y: number, dir: number): boolean {
		const tx = Math.floor(x / TILE) + DIRS[dir].x;
		const ty = Math.floor(y / TILE) + DIRS[dir].y;
		if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) return true;
		return this.blocked.has(`${tx},${ty}`);
	}
}

// ---------------------------------------------------------------- start
new Phaser.Game({
	type: Phaser.AUTO,
	width: W,
	height: H,
	backgroundColor: "#000000",
	scale: {
		mode: Phaser.Scale.FIT, // scale to the window, keep the 1000x650 aspect ratio
		autoCenter: Phaser.Scale.CENTER_BOTH,
	},
	physics: { default: "arcade", arcade: { debug: false } },
	scene: [Boot, Slides, Game],
});

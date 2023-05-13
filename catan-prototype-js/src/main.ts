import { Application, Container, Graphics } from "pixi.js";
import "@pixi/graphics-extras";


const target = document.getElementById('app')!;
const { clientWidth, clientHeight } = target;

const app = new Application({
  width: clientWidth,
  height: clientHeight,
  antialias: true
});
target.appendChild(app.view as HTMLCanvasElement);

class Hex extends Graphics {
  constructor(x: number, y: number, radius: number) {
    super();
    this.lineStyle({ width: 5, color: 0xffffff });
    this.drawRegularPolygon!(0, 0, radius, 6);
    this.x = x;
    this.y = y;
  }
}

// app.stage.addChild(new Hex(200, 200, 100));
// app.stage.addChild(new Hex(200 + Math.sqrt(3) * 100, 200, 100));
// app.stage.addChild(new Hex(200 + Math.sqrt(3) / 2 * 100, 350, 100));

const HEX_RADIUS = 80;
const HEX_HORIZONTAL_DISTANCE = Math.sqrt(3) * HEX_RADIUS;
const HEX_VERTICAL_DISTANCE = HEX_RADIUS * 1.5;
const ODD_ROW_OFFSET = Math.sqrt(3) / 2 * HEX_RADIUS;

const map = `
EHHHE
HHHHE
HHHHH
HHHHE
EHHHE
`.trim().split("\n").map(line => line.split(""));

const mapContainer = new Container();

map.forEach((row, rowIdx) => {
  const oddRowOffset = rowIdx % 2 === 1 ? ODD_ROW_OFFSET : 0;
  const hexYPos = HEX_VERTICAL_DISTANCE * rowIdx;
  row.forEach((column, columnIdx) => {
    switch (column) {
      case "H":
        const hexXPos = HEX_HORIZONTAL_DISTANCE * columnIdx + oddRowOffset;
        mapContainer.addChild(new Hex(hexXPos, hexYPos, HEX_RADIUS));
        break;
      default:
        return;
    }
  });
});

const bounds = mapContainer.getLocalBounds();
mapContainer.pivot.x = bounds.width / 2 + bounds.x;
mapContainer.pivot.y = bounds.height / 2 + bounds.y;
mapContainer.x = app.view.width / 2;
mapContainer.y = app.view.height / 2;
mapContainer.addChild(new Hex(mapContainer.pivot.x, mapContainer.pivot.y, 20));
console.log(mapContainer.width, mapContainer.height);
console.log(mapContainer.getLocalBounds());
app.stage.addChild(mapContainer);
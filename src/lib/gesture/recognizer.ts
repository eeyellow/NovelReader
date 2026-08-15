import { Direction, Point } from "./types";

export class GestureRecognizer {
  private minDistance: number;

  constructor(minDistance = 22) {
    this.minDistance = minDistance;
  }

  public setMinDistance(dist: number) {
    this.minDistance = dist;
  }

  /**
   * 計算兩點之間的單一步伐方向
   */
  private getDirection(p1: Point, p2: Point): Direction | null {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distance = Math.hypot(dx, dy);

    if (distance < this.minDistance) return null;

    // 計算角度（-180 ~ 180 度）
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

    if (angle >= -45 && angle <= 45) return "R";
    if (angle > 45 && angle < 135) return "D";
    if (angle >= 135 || angle <= -135) return "L";
    if (angle >= -135 && angle < -45) return "U";

    return null;
  }

  /**
   * 將連續軌跡點轉換為手勢字串 (例如: "DR", "UD")
   */
  public recognize(points: Point[]): string {
    if (points.length < 2) return "";

    const rawDirections: Direction[] = [];
    let lastPoint = points[0];

    for (let i = 1; i < points.length; i++) {
      const dir = this.getDirection(lastPoint, points[i]);
      if (dir) {
        rawDirections.push(dir);
        lastPoint = points[i];
      }
    }

    // 連續相同方向壓縮去重 (UUURRDD -> URD)
    const compressed = rawDirections.filter(
      (dir, index) => index === 0 || dir !== rawDirections[index - 1]
    );

    return compressed.join("");
  }

  /**
   * 將手勢字串轉換為箭頭符號 (例如 "DR" -> "⬇️ ➡️")
   */
  public static toArrowSymbols(gesture: string): string {
    const symbolMap: Record<string, string> = {
      U: "⬆️",
      D: "⬇️",
      L: "⬅️",
      R: "➡️",
    };
    return gesture
      .split("")
      .map((ch) => symbolMap[ch] || ch)
      .join(" ");
  }
}

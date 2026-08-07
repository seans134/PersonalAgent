import Svg, { Circle, Line, Polygon, Polyline, Rect } from "react-native-svg";

export type IconName =
  | "today"
  | "calendar"
  | "meals"
  | "workouts"
  | "more"
  | "back";

type IconProps = {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
};

/**
 * Line icons for the Atlas cartographic system, drawn as SVG so they stay crisp
 * and share one visual language (compass, map, plate, barbell). Replaces the
 * hand-built View glyphs.
 */
export function Icon({ name, size = 24, color, strokeWidth = 1.8 }: IconProps) {
  const common = {
    stroke: color,
    strokeWidth,
    fill: "none" as const,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "today": // compass
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={9} {...common} />
          <Polygon points="15.5,8.5 10.5,10.5 8.5,15.5 13.5,13.5" fill={color} stroke="none" />
        </Svg>
      );
    case "calendar": // folded map
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21" {...common} />
          <Line x1={9} y1={3} x2={9} y2={18} {...common} />
          <Line x1={15} y1={6} x2={15} y2={21} {...common} />
        </Svg>
      );
    case "meals": // plate
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={8} {...common} />
          <Circle cx={12} cy={12} r={3.4} {...common} />
        </Svg>
      );
    case "workouts": // dumbbell
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x={2.5} y={9} width={3} height={6} rx={1} {...common} />
          <Rect x={18.5} y={9} width={3} height={6} rx={1} {...common} />
          <Line x1={5.5} y1={12} x2={18.5} y2={12} {...common} />
        </Svg>
      );
    case "more": // meridian dots
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={5} cy={12} r={1.7} fill={color} />
          <Circle cx={12} cy={12} r={1.7} fill={color} />
          <Circle cx={19} cy={12} r={1.7} fill={color} />
        </Svg>
      );
    case "back": // chevron
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Polyline points="15,5 8,12 15,19" {...common} />
        </Svg>
      );
    default:
      return null;
  }
}

import { RouteSkeleton } from "@/components/shell/page";

// 侧栏切换到还没预取完的页面时立即显示（没有 loading 边界时旧页面会停住，直到新页面的脚本与载荷都到）
export default function AppLoading() {
  return <RouteSkeleton />;
}

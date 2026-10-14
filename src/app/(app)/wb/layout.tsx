import { WorkbenchFrame } from "./workbench-frame";

export default function WorkbenchLayout({ children }: { children: React.ReactNode }) {
  return <WorkbenchFrame>{children}</WorkbenchFrame>;
}

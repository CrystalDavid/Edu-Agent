import { FileManager } from "../components/portal/FileManager";
import { PageHeader } from "../components/portal/PortalPrimitives";

export function TeacherFilesPage(props: {
  onAction: (message: string) => void;
}) {
  return (
    <div className="portal-page files-page" data-testid="files-page">
      <PageHeader title="文件" subtitle="按用途、课程和最近使用组织你的教学材料" />
      <FileManager onAction={(action) => props.onAction(`${action}：当前使用本地演示文件，不会上传、分享或删除真实内容。`)} />
    </div>
  );
}

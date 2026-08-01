import { FileManager } from "../components/portal/FileManager";
import { PageHeader } from "../components/portal/PortalPrimitives";

export function TeacherFilesPage(props: {
  onAction: (message: string) => void;
  initialAssetRef?: string | null;
  initialLessonRef?: string | null;
}) {
  return (
    <div className="portal-page files-page" data-testid="files-page">
      <PageHeader title="文件" subtitle="真实上传、版本、关联与已批准教学成果" />
      <FileManager
        onAction={props.onAction}
        {...(props.initialAssetRef !== undefined
          ? { initialAssetRef: props.initialAssetRef }
          : {})}
        {...(props.initialLessonRef !== undefined
          ? { initialLessonRef: props.initialLessonRef }
          : {})}
      />
    </div>
  );
}

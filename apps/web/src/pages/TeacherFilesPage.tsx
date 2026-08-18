import { FileManager } from "../components/portal/FileManager";

export function TeacherFilesPage(props: {
  onAction: (message: string) => void;
  initialAssetRef?: string | null;
  initialLessonRef?: string | null;
}) {
  return (
    <div className="portal-page files-page" data-testid="files-page">
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

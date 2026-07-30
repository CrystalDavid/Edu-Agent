import type { ReactNode } from "react";

export function SettingsSection(props: {
  id: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="settings-section" id={`settings-${props.id}`} data-settings-section={props.id}>
      <header>
        <div>
          <h2>{props.title}</h2>
          {props.description ? <p>{props.description}</p> : null}
        </div>
        {props.action}
      </header>
      <div className="settings-section__body">{props.children}</div>
    </section>
  );
}
export function SettingsRow(props: {
  label: string;
  description?: string;
  control: ReactNode;
}) {
  return (
    <div className="settings-row">
      <span>
        <strong>{props.label}</strong>
        {props.description ? <small>{props.description}</small> : null}
      </span>
      <div>{props.control}</div>
    </div>
  );
}

import { useEffect, useState } from "react";

import type {
  ActiveSessionView,
  AdminMemberView,
  AuthenticationSessionStatus,
  DataGovernanceRequestView,
  SchoolDetail,
  SecurityEventView
} from "@edu-agent/contracts";
import { Alert, Button, Input, Select, Space, Table, Tag, Typography } from "antd";

import {
  createSchoolMember,
  createUserDataGovernanceRequest,
  loadActiveSessions,
  loadCurrentSchool,
  loadDataGovernanceRequests,
  loadSchoolMembers,
  loadSecurityEvents,
  revokeAuthenticationSession,
  updateSchoolMemberCourseAccess,
  updateSchoolMemberRoles,
  updateSchoolMemberStatus
} from "../../api";

type AuthenticatedSession = Extract<
  AuthenticationSessionStatus,
  { authenticated: true }
>;

export function IdentityOrganizationSettings(props: {
  session: AuthenticatedSession;
  onAction: (message: string) => void;
}) {
  const [school, setSchool] = useState<SchoolDetail | null>(null);
  const [sessions, setSessions] = useState<ActiveSessionView[]>([]);
  const [members, setMembers] = useState<AdminMemberView[]>([]);
  const [events, setEvents] = useState<SecurityEventView[]>([]);
  const [requests, setRequests] = useState<DataGovernanceRequestView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newRole, setNewRole] = useState<"ordinary_teacher" | "school_admin">("ordinary_teacher");
  const isAdmin = props.session.currentWorkspace?.roles.includes("school_admin") ?? false;

  const execute = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "身份或组织操作失败，请刷新后重试。");
    }
  };

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [schoolResult, sessionResult, requestResult] = await Promise.all([
        loadCurrentSchool(),
        loadActiveSessions(),
        loadDataGovernanceRequests()
      ]);
      setSchool(schoolResult);
      setSessions(sessionResult.items);
      setRequests(requestResult.items);
      if (isAdmin) {
        const [memberResult, eventResult] = await Promise.all([
          loadSchoolMembers(),
          loadSecurityEvents()
        ]);
        setMembers(memberResult.items);
        setEvents(eventResult.items);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取身份与学校信息。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [props.session.sessionRef, props.session.currentWorkspace?.membershipRef]);

  return (
    <div className="identity-settings" data-testid="identity-organization-settings">
      {error ? <Alert type="error" showIcon message={error} /> : null}
      <div className="identity-summary-grid">
        <article>
          <Typography.Text type="secondary">用户</Typography.Text>
          <strong>{props.session.user.displayName}</strong>
          <span>{props.session.user.email ?? "未提供邮箱"}</span>
        </article>
        <article>
          <Typography.Text type="secondary">当前学校</Typography.Text>
          <strong>{school?.name ?? "加载中"}</strong>
          <span>{school?.status ?? "—"} · {school?.timezone ?? "—"}</span>
        </article>
        <article>
          <Typography.Text type="secondary">角色与课程范围</Typography.Text>
          <strong>{props.session.currentWorkspace?.roles.join(" / ")}</strong>
          <span>{props.session.currentWorkspace?.courseRunRefs.length ?? 0} 个 CourseRun</span>
        </article>
        <article>
          <Typography.Text type="secondary">会话</Typography.Text>
          <strong>{props.session.authenticationMethod}</strong>
          <span>到期：{new Date(props.session.expiresAt).toLocaleString("zh-CN")}</span>
        </article>
      </div>

      <section>
        <h3>活跃会话</h3>
        <Table
          size="small"
          loading={loading}
          rowKey="sessionRef"
          pagination={false}
          dataSource={sessions}
          columns={[
            { title: "客户端", dataIndex: "clientLabel", ellipsis: true },
            { title: "方式", dataIndex: "authenticationMethod" },
            {
              title: "状态",
              render: (_value, row) =>
                row.current ? <Tag color="blue">当前</Tag> : row.revokedAt ? <Tag>已撤销</Tag> : <Tag color="green">活动</Tag>
            },
            {
              title: "到期",
              render: (_value, row) => new Date(row.expiresAt).toLocaleString("zh-CN")
            },
            {
              title: "操作",
              render: (_value, row) => (
                <Button
                  size="small"
                  disabled={row.current || row.revokedAt !== null}
                  onClick={() => void execute(async () => {
                    await revokeAuthenticationSession(row.sessionRef, row.version);
                    props.onAction("会话已撤销。");
                    await refresh();
                  })}
                >撤销</Button>
              )
            }
          ]}
        />
      </section>

      <section>
        <h3>数据治理请求</h3>
        <Space wrap>
          <Button onClick={() => void execute(async () => {
            const result = await createUserDataGovernanceRequest({
              requestType: "export",
              reason: "教师请求导出当前个人与组织成员数据。",
              idempotencyKey: `ui-export-${crypto.randomUUID()}`
            });
            setRequests(result.items);
            props.onAction("数据导出请求已登记，等待人工审核。");
          })}>申请数据导出</Button>
          <Button danger onClick={() => void execute(async () => {
            const result = await createUserDataGovernanceRequest({
              requestType: "de_identification",
              reason: "教师请求评估去标识范围，不直接破坏教学历史。",
              idempotencyKey: `ui-deidentify-${crypto.randomUUID()}`
            });
            setRequests(result.items);
            props.onAction("去标识请求已登记，教学与审计历史不会被直接删除。");
          })}>申请去标识评估</Button>
          <Button danger onClick={() => void execute(async () => {
            const result = await createUserDataGovernanceRequest({
              requestType: "deletion",
              reason: "教师请求评估账号删除范围；保留依法和教学来源链必须保留的历史。",
              idempotencyKey: `ui-deletion-${crypto.randomUUID()}`
            });
            setRequests(result.items);
            props.onAction("删除评估请求已登记；当前没有直接删除任何教学或审计历史。");
          })}>申请删除范围评估</Button>
        </Space>
        <ul className="data-governance-request-list">
          {requests.map((request) => (
            <li key={request.requestRef}>
              <Tag>{request.requestType}</Tag>
              <span>{request.status}</span>
              <small>{request.retentionNotice}</small>
            </li>
          ))}
        </ul>
      </section>

      {isAdmin ? (
        <section data-testid="school-admin-panel">
          <h3>学校成员管理</h3>
          <Alert
            type="info"
            showIcon
            message="管理员预配置成员"
            description="本 Gate 不发送邮件；external subject 由学校管理员与身份供应商配置对应。"
          />
          <div className="member-create-row">
            <Input data-testid="admin-new-member-name" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="显示名称" />
            <Input data-testid="admin-new-member-subject" value={newSubject} onChange={(event) => setNewSubject(event.target.value)} placeholder="外部 subject（合成）" />
            <Select value={newRole} onChange={setNewRole} options={[
              { value: "ordinary_teacher", label: "ordinary_teacher" },
              { value: "school_admin", label: "school_admin" }
            ]} />
            <Button
              data-testid="admin-create-member"
              type="primary"
              disabled={!newName.trim() || !newSubject.trim()}
              onClick={() => void execute(async () => {
                await createSchoolMember({
                  displayName: newName.trim(),
                  externalProvider: "local-development",
                  externalSubject: newSubject.trim(),
                  roles: newRole === "school_admin" ? ["school_admin", "ordinary_teacher"] : ["ordinary_teacher"],
                  courseRunRefs: props.session.currentWorkspace?.courseRunRefs ?? [],
                  idempotencyKey: `ui-member-${crypto.randomUUID()}`
                });
                setNewName("");
                setNewSubject("");
                props.onAction("成员已建立并绑定外部身份。");
                await refresh();
              })}
            >添加成员</Button>
          </div>
          <Table
            size="small"
            rowKey="membershipRef"
            pagination={false}
            dataSource={members}
            columns={[
              { title: "成员", dataIndex: "displayName" },
              { title: "状态", dataIndex: "status" },
              {
                title: "角色",
                render: (_value, row) => (
                  <Select
                    data-testid={`member-roles-${row.membershipRef}`}
                    mode="multiple"
                    value={row.roles}
                    style={{ minWidth: 210 }}
                    options={[
                      "ordinary_teacher",
                      "school_admin",
                      "subject_lead",
                      "homeroom_teacher"
                    ].map((value) => ({ value, label: value }))}
                    onChange={(roles) => void execute(async () => {
                      if (roles.length === 0) {
                        throw new Error("成员至少需要保留一个角色。");
                      }
                      await updateSchoolMemberRoles(row.membershipRef, {
                        roles,
                        expectedVersion: row.version,
                        idempotencyKey: `ui-member-roles-${crypto.randomUUID()}`
                      });
                      await refresh();
                    })}
                  />
                )
              },
              {
                title: "课程",
                render: (_value, row) => (
                  <Select
                    data-testid={`member-course-access-${row.membershipRef}`}
                    mode="multiple"
                    value={row.courseRunRefs}
                    style={{ minWidth: 220 }}
                    options={(props.session.currentWorkspace?.courseRunRefs ?? [])
                      .map((value) => ({ value, label: value }))}
                    onChange={(courseRunRefs) => void execute(async () => {
                      await updateSchoolMemberCourseAccess(row.membershipRef, {
                        courseRunRefs,
                        expectedVersion: row.version,
                        idempotencyKey: `ui-member-courses-${crypto.randomUUID()}`
                      });
                      await refresh();
                    })}
                  />
                )
              },
              {
                title: "操作",
                render: (_value, row) => (
                  <Button
                    data-testid={`member-status-${row.membershipRef}`}
                    size="small"
                    danger={row.status === "active"}
                    onClick={() => void execute(async () => {
                      await updateSchoolMemberStatus(row.membershipRef, {
                        status: row.status === "active" ? "suspended" : "active",
                        expectedVersion: row.version,
                        idempotencyKey: `ui-member-status-${crypto.randomUUID()}`
                      });
                      await refresh();
                    })}
                  >{row.status === "active" ? "停用" : "启用"}</Button>
                )
              }
            ]}
          />
          <h3>关键安全 Audit</h3>
          <ul className="security-event-list">
            {events.slice(0, 20).map((event) => (
              <li key={event.eventRef}>
                <Tag color={event.outcome === "success" ? "green" : "red"}>{event.outcome}</Tag>
                <strong>{event.eventType}</strong>
                <span>{event.safeReason}</span>
                <small>{new Date(event.occurredAt).toLocaleString("zh-CN")}</small>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <Alert type="info" message="学校成员管理仅对 school_admin 显示。" />
      )}
    </div>
  );
}

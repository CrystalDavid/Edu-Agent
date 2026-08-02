import type { AuthenticationSessionStatus } from "@edu-agent/contracts";
import { Button, Card, Tag, Typography } from "antd";

type AuthenticatedSession = Extract<
  AuthenticationSessionStatus,
  { authenticated: true }
>;

export function WorkspaceSelectionPage(props: {
  session: AuthenticatedSession;
  onSelect: (membershipRef: string) => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const active = props.session.memberships.filter(
    (membership) =>
      membership.membershipStatus === "active" &&
      membership.organizationStatus === "active"
  );
  return (
    <main className="identity-page" data-testid="workspace-selection-page">
      <Card className="identity-card">
        <Typography.Title level={2}>选择学校工作空间</Typography.Title>
        <Typography.Paragraph type="secondary">
          {props.session.user.displayName} 拥有多个学校成员关系。每次只在一个学校范围内读取课程和教学数据。
        </Typography.Paragraph>
        <div className="workspace-membership-list">
          {active.map((membership) => (
            <button
              data-testid={`workspace-${membership.organizationRef}`}
              type="button"
              key={membership.membershipRef}
              onClick={() => void props.onSelect(membership.membershipRef)}
            >
              <span>
                <strong>{membership.organizationName}</strong>
                <small>{membership.courseRunRefs.length} 个已授权课程</small>
              </span>
              <span className="workspace-role-tags">
                {membership.roles.map((role) => (
                  <Tag key={role}>{role}</Tag>
                ))}
              </span>
            </button>
          ))}
        </div>
        {active.length === 0 ? (
          <Typography.Text type="danger">
            当前没有活动 Membership，请联系学校管理员。
          </Typography.Text>
        ) : null}
        <Button data-testid="workspace-logout" onClick={() => void props.onLogout()}>退出登录</Button>
      </Card>
    </main>
  );
}

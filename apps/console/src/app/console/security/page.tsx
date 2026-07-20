import { redirect } from 'next/navigation';
import { PageHeader, Section } from '@/components/console/kit';
import { AuditVerify } from '@/components/console/audit-verify';
import { MfaManager } from '@/components/console/mfa-manager';
import { getT } from '@/lib/i18n-server';
import { getAuditVerification, getMfaStatus, isUnauthorized } from '@/lib/server-directory';

export default async function SecurityPage() {
  const [statusResult, auditResult] = await Promise.all([getMfaStatus(), getAuditVerification()]);
  if (isUnauthorized(statusResult) || isUnauthorized(auditResult)) {
    redirect('/login');
  }
  const t = await getT();

  return (
    <>
      <PageHeader title={t('security.title')} description={t('security.description')} />

      <div className="flex flex-col gap-6">
        <Section title={t('security.mfaTitle')} description={t('security.mfaDescription')}>
          <MfaManager initialStatus={statusResult.ok ? statusResult.data : null} />
        </Section>

        <Section title={t('security.auditTitle')} description={t('security.auditDescription')}>
          <AuditVerify initial={auditResult.ok ? auditResult.data : null} />
        </Section>
      </div>
    </>
  );
}

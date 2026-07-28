import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { PageHeader, Section } from '@/components/console/kit';
import { AuditVerify } from '@/components/console/audit-verify';
import { MfaManager } from '@/components/console/mfa-manager';
import { AC_TOKEN_COOKIE } from '@/lib/accesscore';
import { decodeIdentity } from '@/lib/identity';
import { getT } from '@/lib/i18n-server';
import { getAuditVerification, getMfaStatus, isUnauthorized } from '@/lib/server-directory';

export default async function SecurityPage() {
  const [statusResult, auditResult] = await Promise.all([getMfaStatus(), getAuditVerification()]);
  if (isUnauthorized(statusResult) || isUnauthorized(auditResult)) {
    redirect('/login');
  }
  const t = await getT();
  const token = (await cookies()).get(AC_TOKEN_COOKIE)?.value ?? '';
  const aal = decodeIdentity(token, null).aal ?? 1;

  return (
    <>
      <PageHeader title={t('security.title')} description={t('security.description')} />

      <div className="flex flex-col gap-6">
        <Section title={t('security.mfaTitle')} description={t('security.mfaDescription')}>
          <MfaManager initialStatus={statusResult.ok ? statusResult.data : null} aal={aal} />
        </Section>

        <Section title={t('security.auditTitle')} description={t('security.auditDescription')}>
          <AuditVerify initial={auditResult.ok ? auditResult.data : null} />
        </Section>
      </div>
    </>
  );
}

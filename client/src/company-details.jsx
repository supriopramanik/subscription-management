import React from 'react';
import { Building2, Users, CalendarDays } from 'lucide-react';
import { Button, Field, Status } from './components';
import { dateLabel, daysUntil, today } from './lib';

export const emptyCompanyDetails = () => ({
  companyType: '',
  formationPlan: '',
  country: '',
  state: '',
  formationDate: '',
  transactionId: '',
  owners: [],
});

export function CompanyDetails({ sub, timezone = 'Asia/Dhaka', onRenew }) {
  const details = sub.companyDetails;
  if (!details) return null;
  const remaining = daysUntil(sub.nextBillingDate, today(timezone));
  const live = ['active', 'trial'].includes(sub.status);
  const fields = [
    ['Company name', sub.name],
    ['Company type', details.companyType],
    ['Formation plan', details.formationPlan],
    ['Country', details.country],
    ['State', details.state],
    [
      'Formation date',
      details.formationDate && dateLabel(details.formationDate, { year: 'numeric' }),
    ],
    ['Next renewal date', dateLabel(sub.nextBillingDate, { year: 'numeric' })],
    ['Transaction ID', details.transactionId],
  ];
  return (
    <section className="company-details" aria-label="Company Details">
      <div className="company-details-heading">
        <div>
          <h3>Company Details</h3>
          <p>Company formation and renewal information.</p>
        </div>
        {onRenew && (
          <Button variant="secondary" onClick={() => onRenew(sub)}>
            Update renewal
          </Button>
        )}
      </div>
      {live && remaining <= 30 && (
        <div className="company-renewal-alert" role="status">
          <CalendarDays size={19} />
          <div>
            <strong>
              {remaining < 0 ? 'Company renewal overdue' : 'Company renewal due soon'}
            </strong>
            <p>
              Renewal date: {dateLabel(sub.nextBillingDate, { year: 'numeric' })}. Update the
              subscription after renewing.
            </p>
          </div>
        </div>
      )}
      <div className="company-information">
        <header>
          <h4>
            <Building2 size={18} /> Company Information
          </h4>
          <Status value={sub.status} />
        </header>
        <dl className="company-information-grid">
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value || 'Not provided'}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="company-information">
        <header>
          <h4>
            <Users size={18} /> Owners / Members ({details.owners?.length || 0})
          </h4>
        </header>
        {details.owners?.length ? (
          <div className="company-owners">
            {details.owners.map((owner, index) => (
              <article className="company-owner" key={index}>
                <header>
                  <strong>{owner.name}</strong>
                  {owner.ownership != null && (
                    <span className="ownership-badge">{owner.ownership}%</span>
                  )}
                </header>
                <span className="company-owner-role">{owner.role || 'Owner'}</span>
                <dl className="company-information-grid">
                  <div>
                    <dt>Email</dt>
                    <dd>{owner.email || 'Not provided'}</dd>
                  </div>
                  <div>
                    <dt>Address</dt>
                    <dd>{owner.address || 'Not provided'}</dd>
                  </div>
                  <div>
                    <dt>Country</dt>
                    <dd>{owner.country || 'Not provided'}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">Owner / member information has not been provided.</p>
        )}
      </div>
    </section>
  );
}

export function CompanyDetailsFields({ value, onChange }) {
  const set = (key, next) => onChange({ ...value, [key]: next });
  const setOwner = (index, key, next) =>
    set(
      'owners',
      value.owners.map((owner, i) => (i === index ? { ...owner, [key]: next } : owner))
    );
  return (
    <section className="company-details company-details-fields" aria-label="Edit company details">
      <h3>Company Details</h3>
      <div className="form-grid">
        {[
          ['companyType', 'Company type'],
          ['formationPlan', 'Formation plan'],
          ['country', 'Country'],
          ['state', 'State'],
          ['formationDate', 'Formation date'],
          ['transactionId', 'Transaction ID'],
        ].map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              type={key === 'formationDate' ? 'date' : 'text'}
              value={value[key] || ''}
              onChange={(e) => set(key, e.target.value)}
              maxLength={120}
            />
          </Field>
        ))}
      </div>
      <h4>Owners / Members</h4>
      {value.owners.map((owner, index) => (
        <fieldset className="company-owner" key={index}>
          <legend>Owner / member {index + 1}</legend>
          <div className="form-grid">
            {[
              ['name', 'Full name'],
              ['role', 'Role'],
              ['email', 'Email'],
              ['ownership', 'Ownership (%)'],
              ['country', 'Owner country'],
              ['address', 'Address'],
            ].map(([key, label]) => (
              <Field key={key} label={label} required={key === 'name'}>
                <input
                  type={key === 'ownership' ? 'number' : key === 'email' ? 'email' : 'text'}
                  value={owner[key] ?? ''}
                  required={key === 'name'}
                  min={0}
                  max={100}
                  step="any"
                  maxLength={
                    key === 'address' ? 500 : key === 'email' ? 254 : key === 'role' ? 60 : 120
                  }
                  onChange={(e) =>
                    setOwner(
                      index,
                      key,
                      key === 'ownership'
                        ? e.target.value === ''
                          ? null
                          : Number(e.target.value)
                        : e.target.value
                    )
                  }
                />
              </Field>
            ))}
          </div>
          <Button
            type="button"
            variant="danger-ghost"
            onClick={() =>
              set(
                'owners',
                value.owners.filter((_, i) => i !== index)
              )
            }
          >
            Remove member
          </Button>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="secondary"
        disabled={value.owners.length >= 20}
        onClick={() =>
          set('owners', [
            ...value.owners,
            { name: '', role: 'Owner', ownership: null, email: '', country: '', address: '' },
          ])
        }
      >
        Add owner / member
      </Button>
    </section>
  );
}

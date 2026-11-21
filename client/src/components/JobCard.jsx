import { Link } from 'react-router-dom';
import { MapPin, CalendarDays, Users, Clock } from 'lucide-react';
import { CategoryIcon } from '../lib/icons.jsx';
import { dateAR, money, payTypeLabel, relative, statusTone, timeAR } from '../lib/format.js';
import { Avatar, Stars } from './ui.jsx';

export default function JobCard({ job, showStatus = false }) {
  return (
    <Link to={`/changa/${job.id}`} className="job-card" aria-label={`Ver ${job.title}`}>
      {job.image ? (
        <img className="thumb" src={job.image} alt="" loading="lazy" />
      ) : (
        <div className="cat-badge">
          <CategoryIcon name={job.categoryIcon} size={26} />
        </div>
      )}

      <div className="job-card-body">
        <div className="row between" style={{ gap: 8, alignItems: 'flex-start' }}>
          <div className="job-card-title">{job.title}</div>
          {showStatus && <span className={`badge ${statusTone(job.status)}`}>{job.statusLabel}</span>}
        </div>
        <div className="job-card-desc">{job.description}</div>

        <div className="job-meta">
          <span className="meta-item">
            <MapPin size={12} /> {job.locality}
            {job.distanceKm != null && ` · ${job.distanceKm} km`}
          </span>
          <span className="meta-item">
            <CalendarDays size={12} /> {dateAR(job.workDate)}
          </span>
          {job.workTime && (
            <span className="meta-item">
              <Clock size={12} /> {timeAR(job.workTime)}
            </span>
          )}
          {job.applicationCount > 0 && (
            <span className="meta-item">
              <Users size={12} /> {job.applicationCount}
            </span>
          )}
        </div>

        <div className="owner-line">
          <Avatar user={job.owner} size={20} />
          <strong>{job.owner?.firstName || 'Usuario'}</strong>
          {job.owner?.rating?.count > 0 && (
            <span className="row" style={{ gap: 3 }}>
              <Stars value={job.owner.rating.average} size={10} />
              {job.owner.rating.average}
            </span>
          )}
          <span style={{ marginLeft: 'auto' }} className="tiny">
            {relative(job.createdAt)}
          </span>
        </div>
      </div>

      <div className="job-card-right">
        <div className="job-pay">
          {money(job.payTotal)}
          <small>{payTypeLabel(job.payType)}</small>
        </div>
        {job.myApplication && (
          <span className={`badge ${job.myApplication.status === 'aceptada' ? 'ok' : 'muted'}`}>
            {job.myApplication.statusLabel}
          </span>
        )}
      </div>
    </Link>
  );
}

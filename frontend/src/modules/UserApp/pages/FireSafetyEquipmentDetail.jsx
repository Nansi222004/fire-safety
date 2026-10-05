import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiArrowLeft, FiShield, FiAlertTriangle, FiMessageCircle, FiArrowRight } from 'react-icons/fi';
import MobileLayout from '../components/Layout/MobileLayout';
import PageTransition from '../../../shared/components/PageTransition';
import api from '../../../shared/utils/api';
import { ConditionBadge, IssueStatusBadge, SeverityBadge } from '../../../shared/components/FireSafety/FsBadge';
import { EQUIPMENT_TYPE_LABELS, formatFsDate, formatFsLocation } from '../../../shared/constants/fireSafety';

const recommendationLink = (rec) => {
  if (rec.kind === 'service' && rec.serviceId) return { to: `/services/${rec.serviceId.slug}`, title: rec.serviceId.name, sub: 'Service' };
  if (rec.kind === 'product' && rec.productId) return { to: `/product/${rec.productId._id}`, title: rec.productId.name, sub: rec.productId.price != null ? `Product · ₹${rec.productId.price}` : 'Product' };
  if (rec.kind === 'vendor' && rec.vendorId) return { to: `/seller/${rec.vendorId._id}`, title: rec.vendorId.storeName, sub: 'Recommended provider' };
  return null;
};

const IssueCard = ({ issue, highlighted }) => {
  const ref = useRef(null);
  const [message, setMessage] = useState('');
  const [showContact, setShowContact] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlighted]);

  const contact = async () => {
    if (message.trim().length < 3) return toast.error('Please describe how we can help.');
    setSending(true);
    try {
      await api.post(`/user/fire-safety/issues/${issue._id}/contact`, { message: message.trim() });
      toast.success('Your request has been sent to SafeFire support.');
      setMessage('');
      setShowContact(false);
    } catch { /* toast shown */ } finally { setSending(false); }
  };

  const recs = (issue.recommendations || []).map((r) => ({ ...r, link: recommendationLink(r) })).filter((r) => r.link);

  return (
    <div ref={ref} className={`bg-white border rounded-2xl p-4 space-y-3 ${highlighted ? 'border-[#E31E24] ring-2 ring-red-100' : 'border-slate-200'}`}>
      <div className="flex items-start gap-3">
        <FiAlertTriangle className="text-amber-600 text-lg mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-1">
          <p className="font-bold text-slate-900">{issue.title}</p>
          <div className="flex items-center gap-2 flex-wrap"><SeverityBadge value={issue.severity} /><IssueStatusBadge value={issue.status} /></div>
          {issue.description && <p className="text-sm text-slate-600">{issue.description}</p>}
          <p className="text-xs text-slate-400">{issue.issueNumber} · Identified {formatFsDate(issue.createdAt)}</p>
        </div>
      </div>

      {recs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Recommended by SafeFire</p>
          {recs.map((r, idx) => (
            <Link key={idx} to={r.link.to} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-300">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{r.link.title}</p>
                <p className="text-xs text-slate-500">{r.link.sub}{r.note ? ` · ${r.note}` : ''}</p>
              </div>
              <FiArrowRight className="text-slate-400" />
            </Link>
          ))}
        </div>
      )}

      {showContact ? (
        <div className="space-y-2">
          <textarea rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us how we can help (e.g. schedule a refill visit)"
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#E31E24]" />
          <div className="flex gap-2">
            <button type="button" disabled={sending} onClick={contact} className="px-4 py-2 bg-[#E31E24] hover:bg-[#C8191F] disabled:opacity-60 text-white rounded-xl text-sm font-bold">
              {sending ? 'Sending…' : 'Send to SafeFire'}
            </button>
            <button type="button" onClick={() => setShowContact(false)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold">Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setShowContact(true)} className="inline-flex items-center gap-2 text-sm font-bold text-[#E31E24]">
          <FiMessageCircle /> Contact SafeFire about this issue
        </button>
      )}
    </div>
  );
};

const FireSafetyEquipmentDetail = () => {
  const { equipmentId } = useParams();
  const [searchParams] = useSearchParams();
  const highlightIssue = searchParams.get('issue');
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/user/fire-safety/equipment/${equipmentId}`)
      .then(setData)
      .catch((err) => setError(err.message || 'Equipment not found.'));
  }, [equipmentId]);

  const equipment = data?.equipment;

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={false}>
        <div className="w-full max-w-4xl mx-auto px-4 lg:px-0 py-6 pb-24 space-y-5">
          <button onClick={() => navigate('/my-fire-safety')} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-900">
            <FiArrowLeft /> My Fire Safety
          </button>

          {error ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">{error}</div>
          ) : !equipment ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <>
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-red-50 text-[#E31E24] flex items-center justify-center flex-shrink-0"><FiShield className="text-xl" /></div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-xl font-black text-slate-900">{equipment.name}</h1>
                    <p className="text-sm text-slate-500">{EQUIPMENT_TYPE_LABELS[equipment.equipmentType]}</p>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-slate-500">Current status</p><ConditionBadge value={equipment.currentStatus} /></div>
                  <div><p className="text-xs text-slate-500">Last inspection</p><p className="font-semibold text-slate-800">{formatFsDate(equipment.lastInspectedAt)}</p></div>
                  <div className="sm:col-span-2"><p className="text-xs text-slate-500">Location</p><p className="text-slate-800">{formatFsLocation(equipment.location)}</p></div>
                  {equipment.details?.capacity && <div><p className="text-xs text-slate-500">Capacity</p><p className="text-slate-800">{equipment.details.capacity}</p></div>}
                  {equipment.details?.expiresOn && <div><p className="text-xs text-slate-500">Expires on</p><p className="text-slate-800">{formatFsDate(equipment.details.expiresOn)}</p></div>}
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="font-black text-slate-900">Issues</h2>
                {data.issues.length === 0 ? (
                  <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl p-4">No reported issues for this equipment.</p>
                ) : (
                  data.issues.map((issue) => <IssueCard key={issue._id} issue={issue} highlighted={issue._id === highlightIssue} />)
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                <h2 className="font-black text-slate-900">Inspection history</h2>
                {data.history.length === 0 ? (
                  <p className="text-sm text-slate-500">Not inspected yet.</p>
                ) : (
                  <ol className="relative border-l-2 border-slate-100 ml-2 space-y-4">
                    {data.history.map((h) => (
                      <li key={h.reportNumber} className="pl-4">
                        <span className="absolute -left-[7px] w-3 h-3 rounded-full bg-slate-300 mt-1.5" />
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-800">{formatFsDate(h.inspectedAt)}</span>
                          <ConditionBadge value={h.condition} />
                        </div>
                        {h.observations && <p className="text-xs text-slate-500 mt-1">{h.observations}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <Link to="/support" className="block text-center text-sm font-semibold text-[#E31E24] hover:underline">Need help with something else? Contact SafeFire</Link>
            </>
          )}
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default FireSafetyEquipmentDetail;

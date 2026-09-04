import { useState, useEffect } from 'react';
import { FiSend, FiBell, FiTarget, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import { motion } from 'framer-motion';
import AnimatedSelect from '../../components/AnimatedSelect';
import toast from 'react-hot-toast';
import api from '../../../../shared/utils/api';
import { registerFCMToken } from '../../../../services/pushNotificationService';

const PushNotifications = () => {
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    target: 'all',
    schedule: 'now',
    scheduledDate: '',
  });
  const [isSending, setIsSending] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [hasRegisteredToken, setHasRegisteredToken] = useState(
    typeof window !== 'undefined' && Boolean(localStorage.getItem('fcm_token_web'))
  );

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionStatus(Notification.permission);
      setHasRegisteredToken(Boolean(localStorage.getItem('fcm_token_web')));
    }
  }, []);

  const handleRegisterDevice = async () => {
    setIsRegistering(true);
    try {
      const token = await registerFCMToken(true);
      if (token) {
        setHasRegisteredToken(true);
        setPermissionStatus(Notification.permission);
        toast.success('Browser registered successfully for Push Notifications!');
      } else {
        toast.error('Could not get FCM token. Please ensure notifications are permitted.');
      }
    } catch (err) {
      toast.error('Failed to register device: ' + (err.message || 'Unknown error'));
    } finally {
      setIsRegistering(false);
    }
  };

  const handleSend = async () => {
    if (!formData.title || !formData.message) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSending(true);
    try {
      const payload = {
        title: formData.title,
        message: formData.message,
        target: formData.target,
      };

      const res = await api.post('/fcm-tokens/broadcast', payload);
      const msg = res?.message || 'Push notification broadcast sent successfully!';
      toast.success(msg);
      setFormData({ title: '', message: '', target: 'all', schedule: 'now', scheduledDate: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to send push notification broadcast');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-1">Push Notifications</h1>
          <p className="text-sm sm:text-base text-gray-600">Send live web & mobile push notifications to users</p>
        </div>

        {/* Live Device Status & Register Pill */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border bg-white shadow-sm border-gray-200">
            {permissionStatus === 'granted' ? (
              <span className="flex items-center text-emerald-600 gap-1">
                <FiCheckCircle /> Browser Push: Active
              </span>
            ) : (
              <span className="flex items-center text-amber-600 gap-1">
                <FiAlertCircle /> Browser Push: {permissionStatus}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleRegisterDevice}
            disabled={isRegistering}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors disabled:opacity-50"
          >
            {isRegistering ? 'Registering...' : '🔄 Register Device'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <FiBell className="inline mr-2" />
              Notification Title
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., 🔥 SafeFire Mega Sale: 20% Off Fire Extinguishers!"
              required
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message Body
            </label>
            <textarea
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder="Enter push notification message content..."
              required
              rows={4}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <FiTarget className="inline mr-2" />
              Target Audience
            </label>
            <AnimatedSelect
              value={formData.target}
              onChange={(e) => setFormData({ ...formData, target: e.target.value })}
              options={[
                { value: 'all', label: 'All Users (Customers, Vendors, Delivery, Admins)' },
                { value: 'customers', label: 'Customers Only' },
                { value: 'vendors', label: 'Vendors Only' },
                { value: 'delivery-boy', label: 'Delivery Boys' },
                { value: 'admins', label: 'Admins Only' },
              ]}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Schedule
            </label>
            <AnimatedSelect
              value={formData.schedule}
              onChange={(e) => setFormData({ ...formData, schedule: e.target.value })}
              options={[
                { value: 'now', label: 'Send Now' },
                { value: 'scheduled', label: 'Schedule Later' },
              ]}
            />
          </div>

          {formData.schedule === 'scheduled' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Scheduled Date & Time
              </label>
              <input
                type="datetime-local"
                value={formData.scheduledDate}
                onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                required={formData.schedule === 'scheduled'}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isSending}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold disabled:opacity-50"
          >
            <FiSend />
            <span>{isSending ? 'Sending Broadcast...' : 'Send Broadcast Notification'}</span>
          </button>
        </form>
      </div>
    </motion.div>
  );
};

export default PushNotifications;

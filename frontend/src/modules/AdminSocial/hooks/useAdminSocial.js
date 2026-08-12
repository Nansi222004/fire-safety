import { useState, useEffect } from 'react';
import { mockPayouts } from '../dummyData/payoutData';
import { mockAuditLogs } from '../dummyData/auditLogsData';

export const useAdminSocial = () => {
    const [payouts, setPayouts] = useState(() => {
        const saved = localStorage.getItem('admin_payout_requests');
        return saved ? JSON.parse(saved) : mockPayouts;
    });

    const [logs, setLogs] = useState(() => {
        const saved = localStorage.getItem('admin_social_audit_logs');
        return saved ? JSON.parse(saved) : mockAuditLogs;
    });

    useEffect(() => {
        localStorage.setItem('admin_payout_requests', JSON.stringify(payouts));
    }, [payouts]);

    useEffect(() => {
        localStorage.setItem('admin_social_audit_logs', JSON.stringify(logs));
    }, [logs]);

    const addLog = (action, category = 'General') => {
        const newLog = {
            logId: `l_${Date.now()}`,
            action,
            performedBy: 'Super Admin',
            timestamp: new Date().toISOString(),
            category
        };
        setLogs(prev => [newLog, ...prev]);
    };

    // Payout Actions
    const updatePayoutStatus = (payoutId, newStatus) => {
        setPayouts(prev => prev.map(p => 
            p.payoutId === payoutId ? { ...p, status: newStatus } : p
        ));
        const payout = payouts.find(p => p.payoutId === payoutId);
        addLog(`${newStatus === 'approved' ? 'Approved' : 'Rejected'} Payout for ${payout?.creatorName} (${payout?.amount})`, 'Finance');
    };

    return {
        payouts,
        logs,
        updatePayoutStatus,
    };
};


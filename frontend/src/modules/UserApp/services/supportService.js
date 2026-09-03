import api from '../../../shared/utils/api';

export const createTicket = async (data) => {
    const res = await api.post('/user/support/tickets', data);
    return res.data || res;
};

export const getUserTickets = async (params = {}) => {
    const res = await api.get('/user/support/tickets', { params });
    return res.data || res;
};

export const getTicketById = async (id) => {
    const res = await api.get(`/user/support/tickets/${id}`);
    return res.data || res;
};

export const addTicketMessage = async (id, message) => {
    const res = await api.post(`/user/support/tickets/${id}/messages`, { message });
    return res.data || res;
};

export const getTicketTypes = async () => {
    const res = await api.get('/user/support/ticket-types');
    return res.data || res;
};

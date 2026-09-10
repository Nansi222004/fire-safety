import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import {
  FiMessageSquare,
  FiPlus,
  FiSearch,
  FiEye,
  FiX,
  FiSend,
  FiArrowLeft,
  FiAlertCircle,
  FiChevronRight,
  FiClock,
  FiTag,
} from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import DataTable from "../../Admin/components/DataTable";
import Badge from "../../../shared/components/Badge";
import AnimatedSelect from "../../Admin/components/AnimatedSelect";
import {
  getVendorSupportTickets,
  getVendorSupportTicketTypes,
  createVendorSupportTicket,
  replyToVendorSupportTicket,
} from "../services/vendorService";
import { getSocket, joinRoom, leaveRoom } from "../../../shared/utils/socket";
import { useVendorAuthStore } from "../store/vendorAuthStore";

const SupportTickets = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const fetchTickets = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await getVendorSupportTickets();
      setTickets(response?.data || []);
    } catch (err) {
      setTickets([]);
      toast.error("Failed to load tickets");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchTicketTypes = useCallback(async () => {
    try {
      const res = await getVendorSupportTicketTypes();
      setTicketTypes(res?.data || []);
    } catch (err) {
      setTicketTypes([]);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
    fetchTicketTypes();
  }, [fetchTickets, fetchTicketTypes]);

  const { vendor } = useVendorAuthStore();

  useEffect(() => {
    const token = localStorage.getItem('vendor-token') || localStorage.getItem('token');
    if (!token || !vendor?.id) return;

    const socket = getSocket(token);
    if (!socket) return;

    joinRoom(`vendor_${vendor.id}`);

    const handleNewSupportMessage = (msg) => {
      const ticketId = msg.ticketId;
      if (!ticketId) return;

      // Normalize message fields
      const rawDate = msg.createdAt;
      const parsedDate = new Date(rawDate);
      const isValidDate = rawDate && !isNaN(parsedDate.getTime());

      const normalizedMsg = {
        ...msg,
        _id: msg._id || `temp-${Date.now()}-${Math.random()}`,
        createdAt: isValidDate ? rawDate : new Date().toISOString()
      };

      // Update tickets list and current ticket messages in real-time
      setTickets(prev => prev.map(t => {
        if (t._id === ticketId) {
          const messages = t.messages || [];
          const exists = messages.some(m => m._id === normalizedMsg._id);
          const merged = exists ? messages : [...messages, normalizedMsg];
          const sorted = [...merged].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
          return {
            ...t,
            status: normalizedMsg.status || t.status,
            updatedAt: normalizedMsg.updatedAt || t.updatedAt,
            messages: sorted
          };
        }
        return t;
      }));

      // Background notification toast (only if not viewing the ticket)
      if (String(id) !== String(ticketId)) {
        const senderName = normalizedMsg.senderType === 'admin' ? 'Admin Support' : 'Support';
        toast.success(`New message on Ticket #${String(ticketId).slice(-6).toUpperCase()} from ${senderName}: "${normalizedMsg.message}"`);
      }
    };

    socket.on('new_support_message', handleNewSupportMessage);

    return () => {
      socket.off('new_support_message', handleNewSupportMessage);
      leaveRoom(`vendor_${vendor.id}`);
    };
  }, [vendor?.id, id]);

  const handleSave = async (ticketData) => {
    const trimmedSubject = String(ticketData.subject || '').trim();
    const trimmedDesc = String(ticketData.description || '').trim();

    if (!trimmedSubject || !trimmedDesc || !ticketData.ticketTypeId) {
        toast.error("Please fill all required fields.");
        return;
    }

    if (trimmedSubject.length < 3 || trimmedSubject.length > 100) {
        toast.error("Subject must be between 3 and 100 characters.");
        return;
    }

    if (trimmedDesc.length < 3 || trimmedDesc.length > 1000) {
        toast.error("Description must be between 3 and 1000 characters.");
        return;
    }

    try {
        await createVendorSupportTicket({
            subject: trimmedSubject,
            message: trimmedDesc,
            priority: ticketData.priority || "medium",
            ticketTypeId: ticketData.ticketTypeId
        });
        setShowForm(false);
        toast.success("Ticket created successfully");
        fetchTickets();
    } catch (err) {
        toast.error(err.response?.data?.message || "Failed to create ticket");
    }
  };

  const getStatusVariant = (status) => {
    const statusMap = {
      open: "success",
      in_progress: "pending",
      resolved: "info",
      closed: "cancelled",
    };
    return statusMap[status] || "default";
  };

  const getPriorityColor = (priority) => {
    const colors = {
      low: "bg-blue-50 text-blue-700 border border-blue-200",
      medium: "bg-amber-50 text-amber-700 border border-amber-200",
      high: "bg-rose-50 text-rose-700 border border-rose-200",
      urgent: "bg-purple-50 text-purple-700 border border-purple-200",
    };
    return colors[priority] || "bg-gray-50 text-gray-700 border border-gray-200";
  };

  const getRelativeTime = (dateStr) => {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / (60 * 1000));
      const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
      const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
      
      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
  };

  // Filter tickets client-side
  const filteredTickets = tickets.filter((ticket) => {
    const matchesSearch =
      ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket._id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || ticket.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const columns = [
    {
      key: "_id",
      label: "Ticket ID",
      sortable: true,
      render: (value) => (
        <span className="font-semibold text-gray-800 text-xs font-mono">
          #{value}
        </span>
      ),
    },
    {
      key: "ticketTypeId",
      label: "Category",
      sortable: true,
      render: (val) => (
        <span className="text-xs font-semibold text-gray-750">
          {val ? `${val.icon || '❓'} ${val.name}` : '❓ Other'}
        </span>
      )
    },
    {
      key: "subject",
      label: "Subject",
      sortable: true,
      render: (value) => <span className="font-medium text-xs text-gray-800">{value}</span>
    },
    {
      key: "priority",
      label: "Priority",
      sortable: true,
      render: (value) => (
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getPriorityColor(
            value
          )}`}>
          {value}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => (
        <Badge variant={getStatusVariant(value)}>{value.replace('_', ' ')}</Badge>
      ),
    },
    {
      key: "updatedAt",
      label: "Last Updated",
      sortable: true,
      render: (value) => (
        <span className="text-xs text-gray-500 font-semibold">
          {getRelativeTime(value)}
        </span>
      )
    },
    {
      key: "actions",
      label: "Actions",
      render: (_, row) => (
        <button
          onClick={() => navigate(`/vendor/support-tickets/${row._id}`)}
          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          title="View Ticket"
        >
          <FiEye />
        </button>
      ),
    },
  ];

  if (id) {
    const ticket = tickets.find(t => t._id === id);
    if (ticket) {
        return (
            <TicketDetail
              ticket={ticket}
              navigate={navigate}
              getStatusVariant={getStatusVariant}
              getPriorityColor={getPriorityColor}
              onReply={fetchTickets}
            />
        );
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 sm:space-y-6 pb-6 px-1 sm:px-0">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 sm:border-gray-200 shadow-xs sm:shadow-sm lg:bg-transparent lg:p-0 lg:border-0 lg:shadow-none">
        <div className="lg:hidden">
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 mb-0.5 flex items-center gap-2 tracking-tight">
            <FiMessageSquare className="text-primary-600" />
            Support Desk
          </h1>
          <p className="text-xs text-gray-500 font-medium">
            Create and manage support tickets with platform admin
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md shadow-primary-500/20 active:scale-98 transition-all lg:ml-auto">
          <FiPlus className="text-base" />
          <span>Create Ticket</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl p-3 sm:p-4 shadow-xs sm:shadow-sm border border-gray-100 sm:border-gray-200">
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-4">
          <div className="relative flex-1 w-full sm:min-w-[200px]">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tickets by ID, subject..."
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs sm:text-sm"
            />
          </div>

          <AnimatedSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: "all", label: "All Status" },
              { value: "open", label: "Open" },
              { value: "in_progress", label: "In Progress" },
              { value: "resolved", label: "Resolved" },
              { value: "closed", label: "Closed" },
            ]}
            className="w-full sm:w-auto min-w-[140px]"
          />
        </div>
      </div>

      {/* Tickets List Area */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-6 shadow-xs sm:shadow-sm border border-gray-100 sm:border-gray-150">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : filteredTickets.length > 0 ? (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block">
              <DataTable
                data={filteredTickets}
                columns={columns}
                pagination={true}
                itemsPerPage={10}
              />
            </div>
            
            {/* Mobile List View */}
            <div className="block md:hidden space-y-3">
              {filteredTickets.map(ticket => (
                <div 
                  key={ticket._id}
                  onClick={() => navigate(`/vendor/support-tickets/${ticket._id}`)}
                  className="bg-white p-3.5 rounded-2xl border border-gray-100 flex items-center justify-between cursor-pointer active:scale-98 hover:border-primary-200 hover:shadow-xs transition-all shadow-xs"
                >
                  <div className="flex-1 min-w-0 pr-2.5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-gray-900 truncate">{ticket.subject}</span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-black border uppercase tracking-wider flex-shrink-0 ${
                        ticket.status === 'open' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        ticket.status === 'closed' ? 'bg-gray-50 text-gray-600 border-gray-200' :
                        'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>
                        {ticket.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-gray-400 font-mono mb-2">
                      <span>#{ticket._id.slice(-8).toUpperCase()}</span>
                      {ticket.ticketTypeId && (
                        <>
                          <span>•</span>
                          <span className="font-sans text-gray-600 font-medium truncate">
                            {ticket.ticketTypeId.icon} {ticket.ticketTypeId.name}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-gray-50 text-[10px]">
                      <span className={`px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${getPriorityColor(ticket.priority)}`}>
                        {ticket.priority} priority
                      </span>
                      <span className="text-gray-400 font-medium flex items-center gap-1">
                        <FiClock className="text-[10px]" />
                        {getRelativeTime(ticket.updatedAt)}
                      </span>
                    </div>
                  </div>
                  <FiChevronRight className="text-gray-400 text-base flex-shrink-0 ml-1" />
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-12 border border-dashed border-gray-200 rounded-2xl p-4">
            <FiAlertCircle className="mx-auto mb-2 text-3xl text-gray-300" />
            <h3 className="font-bold text-gray-800 text-sm">No support tickets found</h3>
            <p className="text-xs text-gray-400 mt-0.5">Create your first ticket if you have any store issues.</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-3 px-4 py-2 bg-primary-50 text-primary-600 border border-primary-100 rounded-xl text-xs font-bold hover:bg-primary-100 transition-all inline-flex items-center gap-1.5"
            >
              <FiPlus className="text-xs" />
              <span>New Ticket</span>
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <TicketForm 
          onSave={handleSave} 
          onClose={() => setShowForm(false)} 
          ticketTypes={ticketTypes}
        />
      )}
    </motion.div>
  );
};

const TicketDetail = ({
  ticket,
  navigate,
  getStatusVariant,
  getPriorityColor,
  onReply
}) => {
  const [reply, setReply] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  useEffect(() => {
    joinRoom(`ticket_${ticket._id}`);
    return () => {
      leaveRoom(`ticket_${ticket._id}`);
    };
  }, [ticket._id]);

  const scrollToBottom = (force = false) => {
    const container = chatContainerRef.current;
    if (!container) return;

    if (force) {
      container.scrollTop = container.scrollHeight;
    } else {
      const threshold = 150;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
      if (isNearBottom) {
        container.scrollTop = container.scrollHeight;
      }
    }
  };

  useEffect(() => {
    if (ticket) {
      const messages = ticket.messages || [];
      if (messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.senderType === 'vendor') {
          scrollToBottom(true);
        } else {
          scrollToBottom(false);
        }
      } else {
        scrollToBottom(true);
      }
    }
  }, [ticket.messages]);

  useEffect(() => {
    if (ticket?._id) {
      scrollToBottom(true);
    }
  }, [ticket?._id]);

  const handleSendReply = async (e) => {
    e?.preventDefault();
    const trimmedReply = String(reply || '').trim();
    if (!trimmedReply) return;

    setIsSending(true);
    try {
        await replyToVendorSupportTicket(ticket._id, trimmedReply);
        setReply("");
        toast.success("Reply sent");
        onReply();
    } catch (err) {
        toast.error("Failed to send reply");
    } finally {
        setIsSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendReply(e);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const renderMessagesWithDates = (messages) => {
    const elements = [];

    if (ticket) {
      elements.push(
        <div key="ticket-metadata-mobile" className="block lg:hidden bg-white border border-gray-100 rounded-2xl p-3 mb-3 text-center text-xs text-gray-600 space-y-1 shadow-xs">
            <p className="font-bold text-gray-800 text-xs">Ticket Created: {new Date(ticket.createdAt).toLocaleString()}</p>
            <div className="flex items-center justify-center gap-3 text-[10px] uppercase font-bold text-gray-400 mt-1">
                <span>Status: <span className="text-gray-800">{ticket.status.replace('_', ' ')}</span></span>
                <span>Priority: <span className={`font-black ${getPriorityColor(ticket.priority)}`}>{ticket.priority}</span></span>
            </div>
        </div>
      );
    }

    if (!messages || messages.length === 0) return elements.length > 0 ? elements : null;
    let lastDateStr = null;
    
    messages.forEach((msg, idx) => {
        const date = new Date(msg.createdAt);
        const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        
        const todayStr = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const yesterdayStr = yesterday.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        
        let separatorText = dateStr;
        if (dateStr === todayStr) separatorText = 'Today';
        else if (dateStr === yesterdayStr) separatorText = 'Yesterday';
        
        if (dateStr !== lastDateStr) {
            elements.push(
                <div key={`sep-${idx}`} className="flex justify-center my-2.5">
                    <span className="text-[9px] bg-gray-200/70 text-gray-600 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">{separatorText}</span>
                </div>
            );
            lastDateStr = dateStr;
        }
        
        elements.push(
            <div key={idx} className={`flex ${msg.senderType === 'vendor' ? 'justify-end' : 'justify-start'} animate-fadeIn`}>
                <div 
                    onDoubleClick={() => copyToClipboard(msg.message)}
                    title="Double-click to copy"
                    className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-3.5 py-2 sm:px-4 sm:py-2.5 shadow-xs cursor-pointer select-none ${
                        msg.senderType === 'vendor' 
                        ? 'bg-primary-600 text-white rounded-tr-none' 
                        : 'bg-white text-gray-850 rounded-tl-none border border-gray-100'
                    }`}
                >
                    <p className="text-xs sm:text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                    <p className={`text-[9px] mt-1 text-right ${msg.senderType === 'vendor' ? 'text-primary-100' : 'text-gray-400'}`}>
                        {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>
            </div>
        );
    });
    
    return elements;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 sm:space-y-6 pb-6 px-1 sm:px-0">
      <div className="flex items-center gap-2.5 mb-2 px-1 lg:px-0 pt-1 lg:pt-0">
        <button
          onClick={() => navigate("/vendor/support-tickets")}
          className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-600">
          <FiArrowLeft className="text-lg" />
        </button>
        <div className="lg:hidden flex-1 min-w-0">
          <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">
            Ticket #{ticket._id.slice(-8).toUpperCase()}
          </h1>
          <p className="text-[11px] text-gray-400 font-semibold truncate">
            {ticket.subject}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
              {/* Messages Area */}
              <div className="bg-white rounded-2xl shadow-xs sm:shadow-sm border border-gray-100 sm:border-gray-150 overflow-hidden flex flex-col h-[calc(100vh-210px)] sm:h-[600px]">
                  <div className="p-3.5 sm:p-4 border-b border-gray-100 bg-gray-50/70 flex items-center justify-between">
                      <h2 className="font-bold text-gray-900 text-xs sm:text-sm truncate">{ticket.subject}</h2>
                      <Badge variant={getStatusVariant(ticket.status)}>{ticket.status.replace('_', ' ')}</Badge>
                  </div>
                  
                  <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 bg-gray-50/40">
                      {renderMessagesWithDates(ticket.messages)}
                      <div ref={messagesEndRef} />
                  </div>

                  {ticket.status === 'closed' ? (
                      <div className="border-t border-gray-100 p-4 sm:p-6 text-center space-y-2 bg-gray-50/80">
                          <p className="text-xs sm:text-sm font-bold text-gray-500">This ticket has been closed. Replies are disabled.</p>
                          <button
                              onClick={() => navigate("/vendor/support-tickets")}
                              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                          >
                              Create New Ticket
                          </button>
                      </div>
                  ) : (
                      <form onSubmit={handleSendReply} className="p-2.5 sm:p-3 border-t border-gray-100 bg-white">
                          <div className="flex gap-2">
                              <textarea 
                                value={reply}
                                onChange={(e) => {
                                    setReply(e.target.value);
                                    e.target.style.height = 'auto';
                                    e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.target.style.height = 'auto';
                                    }
                                    handleKeyDown(e);
                                }}
                                placeholder="Type a reply..."
                                rows="1"
                                className="flex-1 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs sm:text-sm resize-none min-h-[40px] max-h-[100px] overflow-y-auto"
                              />
                              <button 
                                type="submit"
                                disabled={isSending || !reply.trim()}
                                className="p-2.5 sm:p-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-all disabled:opacity-50 flex items-center justify-center shadow-md shadow-primary-500/20 active:scale-95"
                              >
                                  <FiSend className="text-sm" />
                              </button>
                          </div>
                      </form>
                  )}
              </div>
          </div>

          <div className="hidden lg:block space-y-6">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-150">
                  <h3 className="font-bold text-gray-800 mb-4 pb-2 border-b border-gray-100 text-sm">Ticket Info</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</label>
                          <div className="mt-1">
                            <Badge variant={getStatusVariant(ticket.status)}>{ticket.status.replace('_', ' ')}</Badge>
                          </div>
                      </div>
                      <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Priority</label>
                          <div className={`mt-1 inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase border ${getPriorityColor(ticket.priority)}`}>
                              {ticket.priority}
                          </div>
                      </div>
                      <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Created At</label>
                          <p className="text-xs text-gray-650 mt-1 font-semibold">{new Date(ticket.createdAt).toLocaleString()}</p>
                      </div>
                  </div>
              </div>
          </div>
      </div>
    </motion.div>
  );
};

const TicketForm = ({ onSave, onClose, ticketTypes = [] }) => {
  const [formData, setFormData] = useState({
    subject: "",
    ticketTypeId: ticketTypes[0]?._id || "",
    priority: "medium",
    description: "",
  });

  useEffect(() => {
    if (ticketTypes.length > 0 && !formData.ticketTypeId) {
      setFormData(prev => ({ ...prev, ticketTypeId: ticketTypes[0]._id }));
    }
  }, [ticketTypes]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const modalJSX = (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[100000]"
      />
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 max-w-xl w-full max-h-[85vh] sm:max-h-[90vh] overflow-y-auto border border-gray-100 shadow-2xl flex flex-col z-[100001] my-auto"
      >
        <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
          <h3 className="text-base sm:text-lg font-bold text-gray-900">Create Support Ticket</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 text-gray-500 transition-colors"
          >
            <FiX size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Subject */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold text-gray-700">Subject *</label>
                <span className="text-[10px] text-gray-400 font-semibold">{formData.subject.length} / 100</span>
            </div>
            <input
              type="text"
              value={formData.subject}
              maxLength={100}
              onChange={(e) =>
                setFormData({ ...formData, subject: e.target.value })
              }
              placeholder="e.g. Settlement issue for June orders"
              required
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs sm:text-sm"
            />
          </div>

          {/* Category & Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Select Category *</label>
              <select
                value={formData.ticketTypeId}
                onChange={(e) =>
                  setFormData({ ...formData, ticketTypeId: e.target.value })
                }
                required
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs sm:text-sm bg-white">
                <option value="">Select Category</option>
                {ticketTypes.map(type => (
                  <option key={type._id} value={type._id}>{type.icon || '❓'} {type.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) =>
                  setFormData({ ...formData, priority: e.target.value })
                }
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs sm:text-sm bg-white uppercase font-semibold">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold text-gray-700">Description *</label>
                <span className="text-[10px] text-gray-400 font-semibold">{formData.description.length} / 1000</span>
            </div>
            <textarea
              value={formData.description}
              maxLength={1000}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Describe your issue in detail..."
              required
              rows="4"
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs sm:text-sm resize-none"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 pt-3 border-t border-gray-100 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors text-xs sm:text-sm text-center">
              Cancel
            </button>
            <button
              type="submit"
              className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white rounded-xl font-bold transition-all text-xs sm:text-sm shadow-md shadow-primary-500/20 text-center active:scale-98">
              Create Ticket
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalJSX, document.body) : null;
};

export default SupportTickets;

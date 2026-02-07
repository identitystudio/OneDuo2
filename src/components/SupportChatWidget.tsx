import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, X, Send, Loader2, Mail, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

interface SupportChatWidgetProps {
  userEmail: string;
  courseId?: string;
}

export function SupportChatWidget({ userEmail, courseId }: SupportChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load or create conversation when widget opens
  useEffect(() => {
    if (isOpen && userEmail) {
      loadConversation();
    }
  }, [isOpen, userEmail]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const loadConversation = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("support-chat", {
        body: {
          action: "get-or-create-conversation",
          userEmail,
          courseId,
        },
      });

      if (error) throw error;

      setConversationId(data.conversation.id);
      setMessages(data.messages || []);
    } catch (err) {
      console.error("Failed to load conversation:", err);
      toast.error("Failed to load support chat");
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !conversationId || isSending) return;

    const userMessage = input.trim();
    setInput("");
    setIsSending(true);

    // Optimistically add user message
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content: userMessage, created_at: new Date().toISOString() },
    ]);

    try {
      const { data, error } = await supabase.functions.invoke("support-chat", {
        body: {
          action: "send-message",
          conversationId,
          userEmail,
          message: userMessage,
        },
      });

      if (error) throw error;

      // Add AI response
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: data.response,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.error("Failed to send message:", err);
      toast.error("Failed to send message");
      // Remove optimistic message
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setIsSending(false);
    }
  };

  const emailSummary = async () => {
    if (!conversationId) return;

    try {
      await supabase.functions.invoke("support-chat", {
        body: {
          action: "email-summary",
          conversationId,
          userEmail,
        },
      });
      setEmailSent(true);
      toast.success("Conversation summary sent to your email!");
    } catch (err) {
      toast.error("Failed to send email summary");
    }
  };

  return (
    <>
      {/* Chat Toggle Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-24 right-6 z-40 w-12 h-12 bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
          >
            <MessageSquare className="h-6 w-6 text-black" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-6 z-50 w-[380px] h-[500px] bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full flex items-center justify-center">
                  <MessageSquare className="h-4 w-4 text-black" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">OneDuo Support</h3>
                  <p className="text-xs text-white/50">AI-powered help</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={emailSummary}
                  disabled={messages.length < 2 || emailSent}
                  className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10"
                  title="Email conversation summary"
                >
                  {emailSent ? <Check className="h-4 w-4 text-green-400" /> : <Mail className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsOpen(false)}
                  className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                          msg.role === "user"
                            ? "bg-cyan-500 text-black rounded-br-md"
                            : "bg-white/[0.06] text-white/90 rounded-bl-md"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                  {isSending && (
                    <div className="flex justify-start">
                      <div className="bg-white/[0.06] rounded-2xl rounded-bl-md px-4 py-3">
                        <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>

            {/* Input */}
            <div className="p-4 border-t border-white/10 bg-white/[0.02]">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
                className="flex gap-2"
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your question..."
                  disabled={isSending || isLoading}
                  className="flex-1 bg-white/[0.06] border-white/10 text-white placeholder:text-white/40 focus-visible:ring-cyan-500"
                />
                <Button
                  type="submit"
                  disabled={!input.trim() || isSending || isLoading}
                  className="bg-cyan-500 hover:bg-cyan-400 text-black"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

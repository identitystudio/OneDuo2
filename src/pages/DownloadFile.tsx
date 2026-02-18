import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Download as DownloadIcon, Loader2, FileText, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const DownloadFile = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token");

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [exportData, setExportData] = useState<any>(null);
    const [downloading, setDownloading] = useState(false);
    const [downloadStarted, setDownloadStarted] = useState(false);

    useEffect(() => {
        const verifyToken = async () => {
            if (!token) {
                setError("Invalid or missing download token.");
                setLoading(false);
                return;
            }

            try {
                const { data, error: fetchError } = await supabase.functions.invoke('get-export-file', {
                    body: { token }
                });

                if (fetchError || !data || data.error) {
                    throw new Error(data?.error || fetchError?.message || "Invalid or expired download link.");
                }

                setExportData(data);

                // Auto-trigger download
                handleDownload(data);
            } catch (err: any) {
                console.error("Token verification failed:", err);
                setError(err.message || "Failed to verify download link.");
            } finally {
                setLoading(false);
            }
        };

        verifyToken();
    }, [token]);

    const handleDownload = async (data = exportData) => {
        if (!data || !data.signedUrl) return;

        setDownloading(true);
        try {
            // Trigger browser download
            const response = await fetch(data.signedUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = data.fileName || `${data.title || 'course'}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            setDownloadStarted(true);
            toast.success("Your download has started!");
        } catch (err: any) {
            console.error("Download trigger failed:", err);
            toast.error("Failed to start download. Please try again.");
        } finally {
            setDownloading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
                    <p className="text-muted-foreground">Verifying your secure link...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="max-w-md w-full text-center">
                    <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
                    <h1 className="text-2xl font-bold mb-2">Link Invalid</h1>
                    <p className="text-muted-foreground mb-6">{error}</p>
                    <Link to="/">
                        <Button>Go to Homepage</Button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="max-w-md w-full">
                {/* Logo */}
                <div className="text-center mb-8">
                    <Link to="/" className="inline-block">
                        <h1 className="text-3xl font-bold text-primary">OneDuo</h1>
                    </Link>
                </div>

                {/* Main Card */}
                <div className="bg-card border border-border rounded-2xl p-8 shadow-xl text-center">
                    {downloadStarted ? (
                        <>
                            <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                                <CheckCircle className="h-10 w-10 text-green-500" />
                            </div>
                            <h2 className="text-2xl font-bold mb-2">Download Started</h2>
                            <p className="text-muted-foreground mb-6">
                                Your Thinking Layer artifact for <span className="text-foreground font-medium">"{exportData.courses.title}"</span> should be downloading now.
                            </p>
                            <div className="space-y-3">
                                <Button onClick={() => handleDownload()} variant="outline" className="w-full">
                                    <DownloadIcon className="h-4 w-4 mr-2" />
                                    Didn't start? Click here
                                </Button>
                                <Link to="/dashboard" className="block">
                                    <Button className="w-full">Back to Dashboard</Button>
                                </Link>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                                <FileText className="h-10 w-10 text-primary" />
                            </div>
                            <h2 className="text-2xl font-bold mb-2">Your PDF is Ready</h2>
                            <p className="text-muted-foreground mb-8">
                                Click the button below to download your artifact for <br />
                                <span className="text-foreground font-medium">"{exportData.courses.title}"</span>
                            </p>
                            <Button
                                onClick={() => handleDownload()}
                                size="lg"
                                className="w-full text-lg py-6"
                                disabled={downloading}
                            >
                                {downloading ? (
                                    <>
                                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                        Starting...
                                    </>
                                ) : (
                                    <>
                                        <DownloadIcon className="h-5 w-5 mr-2" />
                                        Download PDF
                                    </>
                                )}
                            </Button>
                        </>
                    )}
                </div>

                {/* Footer */}
                <p className="text-center text-xs text-muted-foreground mt-6">
                    This secure link expires 24 hours after generation.
                </p>
            </div>
        </div>
    );
};

export default DownloadFile;

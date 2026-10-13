import { useRef } from "react";
import { Link } from "wouter";
import { MessageSquareText } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListMarketingDraftsQueryKey, useGenerateMarketingDrafts, useGetCompany,
  useListMarketingDrafts,
} from "@workspace/api-client-react";
import type { Job, MarketingDraft } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function JobMarketingMessages({ job }: { job: Job }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const generating = useRef(false);
  const company = useGetCompany();
  const drafts = useListMarketingDrafts(undefined, {
    query: { queryKey: getListMarketingDraftsQueryKey(), refetchInterval: 15000, refetchOnWindowFocus: true },
  });
  const generate = useGenerateMarketingDrafts();
  // Include every status: sent and dismissed drafts also count as existing.
  const hasDrafts = drafts.data?.some((draft) => draft.jobId === job.id) ?? false;
  const checking = drafts.isPending || company.isPending;
  const unavailable = drafts.isError || company.isError || !company.data?.name;

  const generateMessages = () => {
    if (generating.current || checking || unavailable || hasDrafts) return;
    generating.current = true;
    generate.mutate({
      data: {
        jobId: job.id,
        jobTitle: job.title,
        clientName: job.contactName,
        clientPhone: job.contactPhone || undefined,
        companyName: company.data!.name,
      },
    }, {
      onSuccess: (created) => {
        queryClient.setQueryData<MarketingDraft[]>(getListMarketingDraftsQueryKey(), (current = []) => [
          ...current.filter((draft) => !created.some((item) => item.id === draft.id)),
          ...created,
        ]);
        toast({
          title: "Marketing drafts added",
          description: "Review request and follow-up drafts are in the Marketing Queue. Nothing has been sent.",
        });
      },
      onError: () => toast({
        title: "Could not generate messages",
        description: "Check the Marketing Queue before trying again.",
        variant: "destructive",
      }),
      onSettled: () => {
        generating.current = false;
        queryClient.invalidateQueries({ queryKey: getListMarketingDraftsQueryKey() });
      },
    });
  };

  return (
    <div className="mt-4 border-t border-border/70 pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" className="gap-2"
          onClick={generateMessages}
          disabled={checking || unavailable || hasDrafts || generate.isPending}
          data-testid="button-generate-messages">
          <MessageSquareText size={15} />
          {generate.isPending ? "Generating..." : "Generate Messages"}
        </Button>
        <Link href="/assistants" className="text-sm font-semibold text-primary hover:text-primary/80">
          Open Marketing Queue
        </Link>
      </div>
      <p className="mt-2 text-xs text-muted-foreground" role="status">
        {checking ? "Checking for existing messages..." : unavailable
          ? "Could not check messages or business details."
          : hasDrafts ? "Messages already exist for this job. Review them in the Marketing Queue."
          : "Create review request and follow-up drafts for approval. Nothing is sent automatically."}
      </p>
      {!checking && unavailable && (
        <Button type="button" variant="ghost" size="sm" onClick={() => { drafts.refetch(); company.refetch(); }}>
          Retry message check
        </Button>
      )}
    </div>
  );
}

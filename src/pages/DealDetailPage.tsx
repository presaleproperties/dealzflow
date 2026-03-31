import { useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { useSyncedTransactions } from '@/hooks/usePlatformConnections';
import { cn } from '@/lib/utils';
import { PageLoader } from '@/components/ui/page-loader';
import { triggerHaptic } from '@/lib/haptics';
import { DealHeroCard } from '@/components/deals/DealHeroCard';
import { DealStatsGrid } from '@/components/deals/DealStatsGrid';
import { DealKeyDatesSection } from '@/components/deals/DealKeyDatesSection';
import { DealTransactionDetailsSection } from '@/components/deals/DealTransactionDetailsSection';
import { DealParticipantsSection } from '@/components/deals/DealParticipantsSection';
import { DealRelatedTransactionsSection } from '@/components/deals/DealRelatedTransactionsSection';
import { DealBuyerInfoCard } from '@/components/deals/DealBuyerInfoCard';
import { extractNetPayout } from '@/lib/transactionUtils';
import type { Participant } from '@/components/deals/ParticipantCard';

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: syncedTransactions = [], isLoading } = useSyncedTransactions();

  const transaction = useMemo(
    () => syncedTransactions.find(tx => tx.id === id),
    [syncedTransactions, id]
  );

  const nav = useMemo(() => {
    if (!id || syncedTransactions.length === 0) return { prev: null, next: null, idx: 0, total: 0 };
    const idx = syncedTransactions.findIndex(tx => tx.id === id);
    return {
      prev: idx > 0 ? syncedTransactions[idx - 1].id : null,
      next: idx < syncedTransactions.length - 1 ? syncedTransactions[idx + 1].id : null,
      idx: idx + 1,
      total: syncedTransactions.length,
    };
  }, [id, syncedTransactions]);

  if (isLoading) {
    return (
      <AppLayout>
        <Header title="Loading..." />
        <PageLoader />
      </AppLayout>
    );
  }

  if (!transaction) {
    return (
      <AppLayout>
        <Header title="Deal Not Found" />
        <div className="p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <FileText className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <p className="text-muted-foreground mb-4">This deal could not be found.</p>
          <Button asChild><Link to="/deals">Back to Deals</Link></Button>
        </div>
      </AppLayout>
    );
  }

  // Extract data
  const raw = transaction.raw_data || {};
  const participants: Participant[] = raw.participants || [];
  const netPayout = extractNetPayout(raw, 0);
  const grossCommission = transaction.commission_amount || 0;
  const salePrice = transaction.sale_price || 0;
  const isClosed = transaction.status === 'closed';
  const isListing = transaction.is_listing;
  const partMatch = transaction.property_address?.match(/Part (\d+\/\d+)/);
  const hasProjectName = !!(raw.projectName || (transaction as any).project_name);
  const isPresale = !!partMatch || hasProjectName;
  const cleanAddress = transaction.property_address
    ? transaction.property_address.replace(/Part \d+\/\d+\s*-\s*/, '').trim()
    : 'Unknown';

  const lifecycleState = raw.lifecycleState?.state || transaction.lifecycle_state || null;
  const lifecycleDesc = raw.lifecycleState?.description || null;
  const complianceStatus = raw.complianceStatus || transaction.compliance_status;
  const transactionCode = raw.code || transaction.transaction_code;
  const firmDate = raw.firmDate || transaction.firm_date;
  const closeDate = transaction.close_date;
  const listingDate = transaction.listing_date;

  const now = new Date();
  const isPastDue = !isClosed && closeDate && new Date(closeDate) < now;

  return (
    <AppLayout>
      <Header
        title="Deal Details"
        action={
          <div className="flex items-center gap-1.5 lg:gap-2">
            <div className="flex items-center gap-0.5 lg:gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 lg:h-9 lg:w-9 rounded-xl touch-manipulation"
                disabled={!nav.prev}
                onClick={() => { triggerHaptic('light'); navigate(`/deals/${nav.prev}`); }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground px-1.5 lg:px-2 min-w-[45px] text-center tabular-nums">
                {nav.idx}/{nav.total}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 lg:h-9 lg:w-9 rounded-xl touch-manipulation"
                disabled={!nav.next}
                onClick={() => { triggerHaptic('light'); navigate(`/deals/${nav.next}`); }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button
              variant="ghost"
              onClick={() => { triggerHaptic('light'); navigate('/deals'); }}
              className="gap-1.5 rounded-xl h-10 lg:h-9 px-3 touch-manipulation"
            >
              <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Back</span>
            </Button>
          </div>
        }
      />

      <div className="p-4 md:p-5 lg:p-6 max-w-5xl mx-auto space-y-3 md:space-y-4 lg:space-y-5 pb-24 lg:pb-6">
        {/* Hero Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        >
          <DealHeroCard
            address={cleanAddress}
            city={transaction.city}
            clientName={transaction.client_name}
            transactionCode={transactionCode}
            status={isClosed ? 'closed' : isPastDue ? 'active' : 'pending'}
            lifecycleState={lifecycleState}
            isPresale={isPresale}
            presalePart={partMatch?.[1]}
            isListing={isListing}
            mlsNumber={transaction.mls_number}
            complianceStatus={complianceStatus}
            closeDate={closeDate}
          />
        </motion.div>

        {/* Stats Grid */}
        <DealStatsGrid
          salePrice={salePrice}
          grossCommission={grossCommission}
          netPayout={netPayout}
          splitPercent={transaction.my_split_percent}
          closeDate={closeDate}
          isClosed={isClosed}
          isPastDue={isPastDue}
        />

        {/* Buyer Info, Dates & Details */}
        <div className="grid md:grid-cols-2 gap-3 md:gap-4 lg:gap-5">
          <div className="space-y-3 md:space-y-4 lg:space-y-5">
            <DealBuyerInfoCard participants={participants} clientName={transaction.client_name} />
            <DealKeyDatesSection
              firmDate={firmDate}
              closeDate={closeDate}
              listingDate={listingDate}
              closedAt={raw.closedAt}
              compliantAt={raw.compliantAt}
              isPastDue={isPastDue}
            />
          </div>
          <DealTransactionDetailsSection
            transactionId={transaction.id}
            transactionType={raw.transactionType || transaction.transaction_type}
            propertyType={raw.propertyType}
            currency={transaction.currency}
            kind={raw.kind}
            lifecycleDesc={lifecycleDesc}
            leadSource={transaction.lead_source}
            buyerType={(transaction as any).buyer_type}
            agentName={transaction.agent_name}
          />
        </div>

        {/* Participants */}
        <DealParticipantsSection participants={participants} />

        {/* Related Transactions */}
        <DealRelatedTransactionsSection
          journeyId={raw.journeyId}
          currentId={id || ''}
          allTransactions={syncedTransactions}
        />
      </div>
    </AppLayout>
  );
}

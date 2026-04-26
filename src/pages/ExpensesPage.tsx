import { useState, useMemo, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, Trash2, ChevronLeft, ChevronRight, 
  Home, Briefcase, Building2, PiggyBank, Receipt,
  TrendingDown, Pencil, Wallet, ArrowUpRight, ArrowDownRight,
  DollarSign, Calendar, MoreHorizontal, X, Check, Tag, Zap, Settings2
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  useExpenses, 
  useCreateExpense, 
  useUpdateExpense, 
  useDeleteExpense 
} from '@/hooks/useExpenses';
import { useProperties, getPropertyMonthlyExpenses, calculatePropertyCashflow } from '@/hooks/useProperties';
import { formatCurrency, getCurrentMonth } from '@/lib/format';
import { ExpenseFormData } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { ExpenseGroupSection } from '@/components/expenses/ExpenseGroupSection';
import { ExpenseRow } from '@/components/expenses/ExpenseRow';
import { PropertyCostsSection } from '@/components/expenses/PropertyCostsSection';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { useRefreshData } from '@/hooks/useRefreshData';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

// Use shared expense categories
import { expenseCategories, getCategoryType, getAllCategoriesFlat, ExpenseType } from '@/lib/expenseCategories';
import { useCustomExpenseCategories } from '@/hooks/useCustomExpenseCategories';

const allCategoriesFlat = getAllCategoriesFlat();

type RecurrenceType = 'monthly' | 'weekly' | 'yearly' | 'one-time';

// Quick-pick chips per type — most common agent expenses
const quickPicks: Record<ExpenseType, string[]> = {
  personal: ['Groceries', 'Gym/Fitness', 'Entertainment/Dining', 'Phone (Personal)', 'Internet', 'Hydro/Utilities'],
  business: ['Board Fees', 'Brokerage Fees', 'Facebook/Social Ads', 'Photography', 'Client Gifts', 'Staging/Clean-ups', 'Phone (Business)', 'CRM (CHIME, etc.)', 'Signs & Signage', 'Admin Support'],
  rental: ['Rental Mortgage', 'Property Management', 'Rental Insurance', 'Rental Repairs/Maintenance', 'Rental Utilities'],
  taxes: ['Tax Set-Aside', 'GST/HST Remittance', 'Debt Pay Down'],
  other: ['Miscellaneous'],
};

const typeConfig: Record<ExpenseType, { icon: typeof Home; label: string; gradient: string; bg: string; border: string; text: string }> = {
  personal: { icon: Home, label: 'Personal', gradient: 'from-blue-500 to-indigo-600', bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-500' },
  business: { icon: Briefcase, label: 'Business', gradient: 'from-violet-500 to-purple-600', bg: 'bg-violet-500/10', border: 'border-violet-500/30', text: 'text-violet-500' },
  rental: { icon: Building2, label: 'Rental', gradient: 'from-teal-500 to-emerald-600', bg: 'bg-teal-500/10', border: 'border-teal-500/30', text: 'text-teal-500' },
  taxes: { icon: PiggyBank, label: 'Taxes', gradient: 'from-amber-500 to-orange-600', bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-500' },
  other: { icon: Receipt, label: 'Other', gradient: 'from-slate-400 to-slate-500', bg: 'bg-muted/50', border: 'border-border', text: 'text-muted-foreground' },
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
};

export default function ExpensesPage() {
  const { data: expenses = [], isLoading } = useExpenses();
  const { data: properties = [] } = useProperties();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const refreshData = useRefreshData();
  const { getCategoriesForType, addCategory, removeCategory, customCategories } = useCustomExpenseCategories();

  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth());
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<ExpenseType>('personal');
  const [activeFilter, setActiveFilter] = useState<ExpenseType | 'all'>('all');
  const [categoryMode, setCategoryMode] = useState<'pick' | 'custom'>('pick');
  const [newCustomName, setNewCustomName] = useState('');
  const [showManageCategories, setShowManageCategories] = useState(false);
  const [formData, setFormData] = useState<Partial<ExpenseFormData> & { recurrence?: RecurrenceType; rental_property_id?: string; is_fixed?: boolean; is_tax_deductible?: boolean }>({
    category: '',
    amount: 0,
    month: currentMonth,
    recurrence: 'monthly',
    rental_property_id: undefined,
    is_fixed: true,
    is_tax_deductible: true,
  });

  const getDefaultTaxDeductible = (type: ExpenseType): boolean => type === 'business' || type === 'rental';

  const handlePrevMonth = () => {
    const date = parseISO(`${currentMonth}-01`);
    date.setMonth(date.getMonth() - 1);
    setCurrentMonth(format(date, 'yyyy-MM'));
  };

  const handleNextMonth = () => {
    const date = parseISO(`${currentMonth}-01`);
    date.setMonth(date.getMonth() + 1);
    setCurrentMonth(format(date, 'yyyy-MM'));
  };

  // Filter expenses for current month
  const monthExpenses = useMemo(() => {
    const currentMonthNum = parseInt(currentMonth.split('-')[1]);
    return expenses.filter((e) => {
      const recurrence = (e as any).recurrence || 'monthly';
      const startMonth = e.month;
      if (recurrence === 'one-time') return e.month === currentMonth;
      if (recurrence === 'yearly') {
        const expenseMonthNum = parseInt(startMonth.split('-')[1]);
        return currentMonthNum === expenseMonthNum && currentMonth >= startMonth;
      }
      return currentMonth >= startMonth;
    });
  }, [expenses, currentMonth]);

  // Calculate totals
  const getDisplayAmount = (expense: typeof expenses[0]) => {
    const recurrence = (expense as any).recurrence || 'monthly';
    if (recurrence === 'weekly') return Number(expense.amount) * 4.33;
    return Number(expense.amount);
  };

  const totalMonthExpenses = useMemo(() => 
    monthExpenses.reduce((sum, e) => sum + getDisplayAmount(e), 0)
  , [monthExpenses]);

  // Property costs
  const propertyCarryingCosts = useMemo(() => {
    let totalPersonalCost = 0;
    let totalRentalNet = 0;
    properties.forEach(property => {
      const builtInExpenses = getPropertyMonthlyExpenses(property);
      if (property.property_type === 'personal') {
        totalPersonalCost += builtInExpenses;
      } else {
        const cashflow = calculatePropertyCashflow(property, 0);
        totalRentalNet += cashflow.net;
      }
    });
    return { personalCost: totalPersonalCost, rentalNet: totalRentalNet };
  }, [properties]);

  const grandTotalExpenses = totalMonthExpenses + propertyCarryingCosts.personalCost - propertyCarryingCosts.rentalNet;

  // Group expenses by type
  const groupedExpenses = useMemo(() => {
    const groups: Record<ExpenseType, typeof expenses> = { personal: [], business: [], rental: [], taxes: [], other: [] };
    monthExpenses.forEach(e => {
      const type = getCategoryType(e.category);
      groups[type].push(e);
    });
    return groups;
  }, [monthExpenses]);

  const getTypeTotal = (type: ExpenseType) => {
    let total = groupedExpenses[type].reduce((sum, e) => sum + getDisplayAmount(e), 0);
    if (type === 'personal') total += propertyCarryingCosts.personalCost;
    if (type === 'rental') total -= propertyCarryingCosts.rentalNet;
    return total;
  };

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    if (activeFilter === 'all') return monthExpenses;
    return groupedExpenses[activeFilter];
  }, [activeFilter, monthExpenses, groupedExpenses]);

  const handleOpenAdd = (type?: ExpenseType) => {
    const expenseType = type || 'personal';
    setEditingId(null);
    setSelectedType(expenseType);
    setCategoryMode('pick');
    setNewCustomName('');
    setFormData({ 
      category: '', 
      amount: 0, 
      month: currentMonth, 
      recurrence: 'monthly', 
      rental_property_id: undefined,
      is_fixed: true,
      is_tax_deductible: getDefaultTaxDeductible(expenseType),
    });
    setShowDialog(true);
  };

  const handleOpenEdit = (expense: typeof expenses[0]) => {
    const type = getCategoryType(expense.category);
    setEditingId(expense.id);
    setSelectedType(type);
    setCategoryMode('pick');
    setNewCustomName('');
    setFormData({
      category: expense.category,
      amount: expense.amount,
      month: expense.month,
      notes: expense.notes || '',
      recurrence: (expense as any).recurrence || 'monthly',
      rental_property_id: (expense as any).rental_property_id || undefined,
      is_fixed: (expense as any).is_fixed !== false,
      is_tax_deductible: (expense as any).is_tax_deductible !== false,
    });
    setShowDialog(true);
  };

  const handleAddCustomCategory = () => {
    const trimmed = newCustomName.trim();
    if (!trimmed) return;
    addCategory(trimmed, selectedType);
    setFormData(p => ({ ...p, category: trimmed }));
    setNewCustomName('');
    setCategoryMode('pick');
  };

  const handleSave = async () => {
    if (!formData.category || !formData.amount) return;
    const dataToSave = {
      ...formData,
      recurrence: formData.recurrence || 'monthly',
      rental_property_id: selectedType === 'rental' ? formData.rental_property_id : null,
      is_fixed: formData.is_fixed !== false,
      is_tax_deductible: formData.is_tax_deductible !== false,
    };
    if (editingId) {
      await updateExpense.mutateAsync({ id: editingId, data: dataToSave });
    } else {
      await createExpense.mutateAsync(dataToSave as ExpenseFormData);
    }
    setShowDialog(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this expense?')) {
      await deleteExpense.mutateAsync(id);
    }
  };

  const currentCategories = expenseCategories[selectedType] || {};

  return (
    <AppLayout>
      <Header 
        title="Expenses" 
        subtitle="Track your monthly spending"
        action={
          <Button onClick={() => handleOpenAdd()} className="btn-premium">
            <Plus className="w-4 h-4 mr-2" />
            Add
          </Button>
        }
      />

      <PullToRefresh onRefresh={refreshData} className="min-h-[calc(100dvh-56px)]">
      <motion.div 
        className="p-4 sm:p-5 md:p-6 lg:p-6 space-y-4 sm:space-y-5"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
         {/* Month Navigator & Total */}
         <motion.div variants={itemVariants} className="card-premium p-4 sm:p-5">
           <div className="flex items-center justify-between mb-4">
             <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="h-8 w-8 rounded-lg hover:bg-muted/50 transition-colors">
               <ChevronLeft className="w-4 h-4" />
             </Button>
             <p className="text-sm font-semibold tracking-tight text-foreground">
               {format(parseISO(`${currentMonth}-01`), 'MMMM yyyy')}
             </p>
             <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-8 w-8 rounded-lg hover:bg-muted/50 transition-colors">
               <ChevronRight className="w-4 h-4" />
             </Button>
           </div>
           <div className="text-center pt-1">
             <p className="metric-label mb-1.5">Total Monthly</p>
             <AnimatedNumber
               value={grandTotalExpenses}
               className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground"
               duration={1}
             />
           </div>
         </motion.div>

         {/* Category Cards */}
         <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              { type: 'personal' as ExpenseType },
              { type: 'business' as ExpenseType },
              { type: 'rental' as ExpenseType },
              { type: 'taxes' as ExpenseType },
            ]).map((item, index) => {
              const config = typeConfig[item.type];
              const total = getTypeTotal(item.type);
              const count = groupedExpenses[item.type].length;
              const isActive = activeFilter === item.type;
              
              return (
                <motion.button
                  key={item.type}
                  onClick={() => setActiveFilter(isActive ? 'all' : item.type)}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04, type: 'spring', stiffness: 240, damping: 28 }}
                  className={cn(
                    "card-premium p-4 space-y-1.5 text-left transition-all duration-200",
                    isActive && "ring-2 ring-primary/30"
                  )}
                >
                  <p className="metric-label">{config.label}</p>
                  <p className="text-xl font-bold tracking-tight text-foreground">{formatCurrency(total)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {count} item{count !== 1 ? 's' : ''}
                  </p>
                </motion.button>
              );
            })}
          </motion.div>

        {/* Filter Pills */}
        <motion.div variants={itemVariants} className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveFilter('all')}
            className={cn(
              "px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all whitespace-nowrap",
              activeFilter === 'all'
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            )}
          >
            All
          </button>
          {(['personal', 'business', 'rental', 'taxes'] as ExpenseType[]).map(type => {
            const config = typeConfig[type];
            return (
              <button
                key={type}
                onClick={() => setActiveFilter(type)}
                className={cn(
                  "px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all whitespace-nowrap",
                  activeFilter === type
                    ? `bg-gradient-to-r ${config.gradient} text-white shadow-lg`
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                )}
              >
                {config.label}
              </button>
            );
          })}
        </motion.div>

        {/* Property Costs Section */}
        <AnimatePresence>
          {(activeFilter === 'all' || activeFilter === 'personal') && properties.filter(p => p.property_type === 'personal').length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              variants={itemVariants}
            >
              <PropertyCostsSection
                icon={Home}
                label="Personal Property"
                total={propertyCarryingCosts.personalCost}
                totalColor="text-blue-500"
                gradientFrom="from-blue-500/10 to-indigo-500/5"
                borderColor="border-blue-500/20"
              >
                {properties.filter(p => p.property_type === 'personal').map(property => {
                  const expenses = getPropertyMonthlyExpenses(property);
                  return (
                    <div key={property.id} className="px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
                      <div>
                        <p className="font-medium text-sm">{property.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[
                            property.monthly_mortgage && `Mortgage`,
                            property.monthly_strata && `Strata`,
                            property.yearly_taxes && `Taxes`
                          ].filter(Boolean).join(' • ')}
                        </p>
                      </div>
                      <span className="font-semibold">{formatCurrency(expenses)}</span>
                    </div>
                  );
                })}
              </PropertyCostsSection>
            </motion.div>
          )}

          {(activeFilter === 'all' || activeFilter === 'rental') && properties.filter(p => p.property_type === 'rental').length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              variants={itemVariants}
            >
              <PropertyCostsSection
                icon={Building2}
                label="Rental Properties"
                total={propertyCarryingCosts.rentalNet}
                totalColor={propertyCarryingCosts.rentalNet >= 0 ? "text-emerald-500" : "text-rose-500"}
                gradientFrom="from-teal-500/10 to-emerald-500/5"
                borderColor="border-teal-500/20"
              >
                {properties.filter(p => p.property_type === 'rental').map(property => {
                  const cashflow = calculatePropertyCashflow(property, 0);
                  return (
                    <div key={property.id} className="px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
                      <div>
                        <p className="font-medium text-sm">{property.name}</p>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="flex items-center gap-1 text-emerald-500">
                            <ArrowUpRight className="w-3 h-3" />
                            {formatCurrency(property.monthly_rent || 0)}
                          </span>
                          <span className="text-muted-foreground">−</span>
                          <span className="flex items-center gap-1 text-rose-500">
                            <ArrowDownRight className="w-3 h-3" />
                            {formatCurrency(cashflow.expenses)}
                          </span>
                        </div>
                      </div>
                      <span className={cn(
                        "font-semibold",
                        cashflow.net >= 0 ? "text-emerald-500" : "text-rose-500"
                      )}>
                        {cashflow.net >= 0 ? '+' : ''}{formatCurrency(cashflow.net)}
                      </span>
                    </div>
                  );
                })}
              </PropertyCostsSection>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expense List */}
        <motion.div variants={itemVariants} className="space-y-2">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : filteredExpenses.length === 0 && activeFilter !== 'all' ? (
            <div className="landing-card p-8 text-center">
              {(() => {
                const config = typeConfig[activeFilter as ExpenseType];
                return (
                  <>
                    <div className={cn("w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4", config.bg)}>
                      <config.icon className={cn("w-8 h-8", config.text)} />
                    </div>
                    <p className="text-muted-foreground mb-4">No {config.label.toLowerCase()} expenses yet</p>
                    <Button onClick={() => handleOpenAdd(activeFilter as ExpenseType)} className="btn-premium">
                      <Plus className="w-4 h-4 mr-2" />
                      Add {config.label} Expense
                    </Button>
                  </>
                );
              })()}
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="landing-card p-8 text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                <Wallet className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground mb-4">No expenses tracked for this month</p>
              <Button onClick={() => handleOpenAdd()} className="btn-premium">
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Expense
              </Button>
            </div>
          ) : activeFilter === 'all' ? (
            // Grouped view for "All" filter - separate Personal, Business, etc.
            <div className="space-y-3">
              <ExpenseGroupSection
                icon={Home}
                label="Personal Expenses"
                total={groupedExpenses.personal.reduce((sum, e) => sum + getDisplayAmount(e), 0)}
                gradientFrom="from-blue-500/10 to-indigo-500/5"
                borderColor="border-blue-500/20"
                totalColor="text-blue-500"
                expenses={groupedExpenses.personal}
                iconBg="bg-blue-500/10"
                iconColor="text-blue-500"
                getDisplayAmount={getDisplayAmount}
                onEdit={handleOpenEdit}
                onDelete={handleDelete}
              />

              <ExpenseGroupSection
                icon={Briefcase}
                label="Business Expenses"
                total={groupedExpenses.business.reduce((sum, e) => sum + getDisplayAmount(e), 0)}
                gradientFrom="from-violet-500/10 to-purple-500/5"
                borderColor="border-violet-500/20"
                totalColor="text-violet-500"
                expenses={groupedExpenses.business}
                iconBg="bg-violet-500/10"
                iconColor="text-violet-500"
                getDisplayAmount={getDisplayAmount}
                onEdit={handleOpenEdit}
                onDelete={handleDelete}
              />

              <ExpenseGroupSection
                icon={PiggyBank}
                label="Taxes & Savings"
                total={groupedExpenses.taxes.reduce((sum, e) => sum + getDisplayAmount(e), 0)}
                gradientFrom="from-amber-500/10 to-orange-500/5"
                borderColor="border-amber-500/20"
                totalColor="text-amber-500"
                expenses={groupedExpenses.taxes}
                iconBg="bg-amber-500/10"
                iconColor="text-amber-500"
                getDisplayAmount={getDisplayAmount}
                onEdit={handleOpenEdit}
                onDelete={handleDelete}
              />

              <ExpenseGroupSection
                icon={Receipt}
                label="Other"
                total={groupedExpenses.other.reduce((sum, e) => sum + getDisplayAmount(e), 0)}
                gradientFrom="from-muted/30 to-muted/10"
                borderColor="border-border/50"
                totalColor="text-muted-foreground"
                expenses={groupedExpenses.other}
                iconBg="bg-muted/50"
                iconColor="text-muted-foreground"
                getDisplayAmount={getDisplayAmount}
                onEdit={handleOpenEdit}
                onDelete={handleDelete}
              />
            </div>
          ) : (
            // Single category view
            <div className="landing-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
                <span className="text-sm font-semibold text-muted-foreground">
                  {typeConfig[activeFilter].label}
                </span>
                <span className="text-sm text-muted-foreground">
                  {filteredExpenses.length} item{filteredExpenses.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="divide-y divide-border/50">
                {filteredExpenses.map((expense) => {
                  const type = getCategoryType(expense.category);
                  const config = typeConfig[type];
                  return (
                    <ExpenseRow
                      key={expense.id}
                      expense={expense}
                      icon={config.icon}
                      iconBg={config.bg}
                      iconColor={config.text}
                      getDisplayAmount={getDisplayAmount}
                      onEdit={handleOpenEdit}
                      onDelete={handleDelete}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>

        {/* Quick Add FAB */}
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleOpenAdd()}
          className="fixed bottom-24 right-4 lg:bottom-8 lg:right-8 w-14 h-14 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-xl shadow-primary/25 flex items-center justify-center z-50"
        >
          <Plus className="w-6 h-6" />
        </motion.button>
      </motion.div>
      </PullToRefresh>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl">{editingId ? 'Edit Expense' : 'New Expense'}</DialogTitle>
              <button
                type="button"
                onClick={() => setShowManageCategories(v => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted"
              >
                <Settings2 className="w-3.5 h-3.5" />
                Manage Custom
              </button>
            </div>
          </DialogHeader>


          {/* Manage Custom Categories Panel */}
          <AnimatePresence>
            {showManageCategories && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2 mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Your Custom Categories</p>
                  {customCategories.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No custom categories yet. Add one below.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {customCategories.map(cat => {
                        const cfg = typeConfig[cat.type];
                        return (
                          <div key={cat.id} className={cn("flex items-center gap-1 px-2 py-1 rounded-full text-xs border", cfg.bg, cfg.border)}>
                            <span className={cfg.text}>{cat.name}</span>
                            <span className="text-muted-foreground/60">·</span>
                            <span className="text-muted-foreground text-[10px]">{cfg.label}</span>
                            <button
                              type="button"
                              onClick={() => removeCategory(cat.id)}
                              className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-5 py-1">
            {/* Type Selection */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Category Type</Label>
              <div className="grid grid-cols-5 gap-2">
                {(['personal', 'business', 'rental', 'taxes', 'other'] as ExpenseType[]).map(type => {
                  const config = typeConfig[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => { 
                        setSelectedType(type);
                        setCategoryMode('pick');
                        setFormData(p => ({ 
                          ...p, 
                          category: '',
                          is_tax_deductible: getDefaultTaxDeductible(type),
                        })); 
                      }}
                      className={cn(
                        "p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1.5",
                        selectedType === type 
                          ? `${config.border} ${config.bg}` 
                          : "border-border hover:border-muted-foreground"
                      )}
                    >
                      <config.icon className={cn("w-5 h-5", selectedType === type ? config.text : "text-muted-foreground")} />
                      <span className={cn("text-[10px] font-medium", selectedType === type ? config.text : "text-muted-foreground")}>
                        {config.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Category — Quick Pick Chips or Custom Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Category</Label>
                <div className="flex rounded-lg border border-border overflow-hidden text-[11px] font-medium">
                  <button
                    type="button"
                    onClick={() => setCategoryMode('pick')}
                    className={cn(
                      "px-2.5 py-1 transition-colors",
                      categoryMode === 'pick' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    Quick Pick
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryMode('custom')}
                    className={cn(
                      "px-2.5 py-1 transition-colors",
                      categoryMode === 'custom' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    Custom
                  </button>
                </div>
              </div>

              {categoryMode === 'pick' ? (
                <div className="space-y-3">
                  {/* Quick-pick chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {quickPicks[selectedType].map(pick => (
                      <button
                        key={pick}
                        type="button"
                        onClick={() => setFormData(p => ({ ...p, category: pick }))}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs border transition-all",
                          formData.category === pick
                            ? `${typeConfig[selectedType].bg} ${typeConfig[selectedType].border} ${typeConfig[selectedType].text} font-semibold`
                            : "border-border bg-muted/30 text-muted-foreground hover:bg-muted hover:border-muted-foreground"
                        )}
                      >
                        {pick}
                      </button>
                    ))}
                  </div>

                  {/* Custom categories for this type */}
                  {getCategoriesForType(selectedType).length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Your Custom</p>
                      <div className="flex flex-wrap gap-1.5">
                        {getCategoriesForType(selectedType).map(cat => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setFormData(p => ({ ...p, category: cat.name }))}
                            className={cn(
                              "px-2.5 py-1 rounded-full text-xs border transition-all",
                              formData.category === cat.name
                                ? `${typeConfig[selectedType].bg} ${typeConfig[selectedType].border} ${typeConfig[selectedType].text} font-semibold`
                                : "border-dashed border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
                            )}
                          >
                            <Tag className="w-2.5 h-2.5 inline mr-1" />
                            {cat.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Browse all via dropdown */}
                  <Select value={formData.category} onValueChange={(v) => setFormData(p => ({ ...p, category: v }))}>
                    <SelectTrigger className="h-9 rounded-xl text-xs text-muted-foreground border-dashed">
                      <SelectValue placeholder="Browse all categories…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {Object.entries(expenseCategories[selectedType] || {}).map(([group, items]) => (
                        <div key={group}>
                          <div className="px-2 py-1.5 text-xs text-muted-foreground font-semibold uppercase tracking-wide">{group}</div>
                          {(items as string[]).map((item: string) => (
                            <SelectItem key={item} value={item}>{item}</SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>

                  {formData.category && (
                    <div className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border", typeConfig[selectedType].bg, typeConfig[selectedType].border)}>
                      <Check className={cn("w-3.5 h-3.5", typeConfig[selectedType].text)} />
                      <span>{formData.category}</span>
                      <button type="button" onClick={() => setFormData(p => ({ ...p, category: '' }))} className="ml-auto text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Custom / manual entry */
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      className="h-11 rounded-xl flex-1"
                      value={newCustomName}
                      onChange={(e) => setNewCustomName(e.target.value)}
                      placeholder="Type category name…"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (newCustomName.trim()) {
                            setFormData(p => ({ ...p, category: newCustomName.trim() }));
                            setNewCustomName('');
                          }
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 px-3 rounded-xl shrink-0"
                      onClick={() => {
                        if (newCustomName.trim()) {
                          setFormData(p => ({ ...p, category: newCustomName.trim() }));
                          setNewCustomName('');
                        }
                      }}
                    >
                      Use Once
                    </Button>
                    <Button
                      type="button"
                      className="h-11 px-3 rounded-xl btn-premium shrink-0"
                      onClick={handleAddCustomCategory}
                      disabled={!newCustomName.trim()}
                    >
                      <Plus className="w-4 h-4" />
                      Save
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground px-1">
                    "Use Once" — sets category for this entry only. "Save" — adds to your quick-picks permanently.
                  </p>

                  {formData.category && (
                    <div className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border", typeConfig[selectedType].bg, typeConfig[selectedType].border)}>
                      <Check className={cn("w-3.5 h-3.5", typeConfig[selectedType].text)} />
                      <span>{formData.category}</span>
                      <button type="button" onClick={() => setFormData(p => ({ ...p, category: '' }))} className="ml-auto text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Rental Property Selection */}
            {selectedType === 'rental' && properties.filter(p => p.property_type === 'rental').length > 0 && (
              <div className="space-y-2">
                <Label>Link to Property</Label>
                <Select value={formData.rental_property_id || ''} onValueChange={(v) => setFormData(p => ({ ...p, rental_property_id: v || undefined }))}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="Select property (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.filter(p => p.property_type === 'rental').map(property => (
                      <SelectItem key={property.id} value={property.id}>{property.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Amount & Recurrence */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Amount</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="number"
                    step="0.01"
                    className="pl-9 h-11 rounded-xl"
                    value={formData.amount || ''}
                    onChange={(e) => setFormData(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select value={formData.recurrence} onValueChange={(v) => setFormData(p => ({ ...p, recurrence: v as RecurrenceType }))}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                    <SelectItem value="one-time">One-time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.recurrence === 'weekly' && formData.amount && (
              <p className="text-sm text-muted-foreground px-1">
                ≈ {formatCurrency(formData.amount * 4.33)}/month
              </p>
            )}

            {/* Start Month */}
            <div className="space-y-2">
              <Label>{formData.recurrence === 'one-time' ? 'Month' : 'Starts From'}</Label>
              <Input
                type="month"
                className="h-11 rounded-xl"
                value={formData.month}
                onChange={(e) => setFormData(p => ({ ...p, month: e.target.value }))}
              />
            </div>

            {/* Classification Toggles */}
            <div className="grid grid-cols-2 gap-3">
              <div className={cn(
                "flex items-center justify-between p-3 rounded-xl border-2 transition-colors",
                formData.is_fixed ? "border-primary/30 bg-primary/5" : "border-border"
              )}>
                <div>
                  <Label className="text-sm cursor-pointer">Fixed Cost</Label>
                  <p className="text-[10px] text-muted-foreground">Counts in runway</p>
                </div>
                <Switch
                  checked={formData.is_fixed}
                  onCheckedChange={(v) => setFormData(p => ({ ...p, is_fixed: v }))}
                />
              </div>
              <div className={cn(
                "flex items-center justify-between p-3 rounded-xl border-2 transition-colors",
                formData.is_tax_deductible ? "border-emerald-500/30 bg-emerald-500/5" : "border-border"
              )}>
                <div>
                  <Label className="text-sm cursor-pointer">Tax Ded.</Label>
                  <p className="text-[10px] text-muted-foreground">Reduces tax burden</p>
                </div>
                <Switch
                  checked={formData.is_tax_deductible}
                  onCheckedChange={(v) => setFormData(p => ({ ...p, is_tax_deductible: v }))}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input
                className="h-11 rounded-xl"
                value={formData.notes || ''}
                onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))}
                placeholder="Add a note…"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)} className="flex-1 h-11 rounded-xl">
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={!formData.category || !formData.amount}
              className="flex-1 h-11 rounded-xl btn-premium"
            >
              <Check className="w-4 h-4 mr-2" />
              {editingId ? 'Save Changes' : 'Add Expense'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

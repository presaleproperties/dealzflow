import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown, ChevronRight, Users, Minus, GitBranch, Link2, Layers, Crown } from 'lucide-react';
import type { NetworkAgent } from '@/hooks/useNetworkData';

interface SponsorTreeProps {
  agents: NetworkAgent[];
  currentUserName?: string;
}

interface TreeNode {
  agent: NetworkAgent | null;
  children: TreeNode[];
  name: string;
  isRoot?: boolean;
}

const TIER_BADGE_COLORS: Record<number, string> = {
  1: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  2: 'bg-teal-500/10 text-teal-600 border-teal-500/20',
  3: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  4: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  5: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
};

const TIER_LINE_COLORS: Record<number, string> = {
  1: 'border-emerald-500/25',
  2: 'border-teal-500/25',
  3: 'border-amber-500/25',
  4: 'border-purple-500/25',
  5: 'border-blue-500/25',
};

function buildTree(agents: NetworkAgent[]): TreeNode {
  const bySponsor: Record<string, NetworkAgent[]> = {};
  const agentNames = new Set(agents.map(a => a.agent_name));

  agents.forEach(a => {
    const sponsor = a.sponsor_name || '__root__';
    if (!bySponsor[sponsor]) bySponsor[sponsor] = [];
    bySponsor[sponsor].push(a);
  });

  const rootAgents = agents.filter(a => !a.sponsor_name || !agentNames.has(a.sponsor_name));

  function buildNode(agent: NetworkAgent): TreeNode {
    const children = (bySponsor[agent.agent_name] || [])
      .sort((a, b) => a.agent_name.localeCompare(b.agent_name))
      .map(buildNode);
    return { agent, children, name: agent.agent_name };
  }

  return {
    agent: null,
    children: rootAgents.sort((a, b) => a.agent_name.localeCompare(b.agent_name)).map(buildNode),
    name: 'You',
    isRoot: true,
  };
}

function TreeNodeComponent({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const agent = node.agent;
  const isActive = agent ? agent.status === 'ACTIVE' && !agent.departure_date : true;

  const initials = node.name.split(' ').map(n => n[0]).join('').slice(0, 2);
  const tierColor = agent ? (TIER_LINE_COLORS[agent.tier] || TIER_LINE_COLORS[1]) : 'border-primary/30';

  return (
    <div className="select-none">
      <div
        className={`group flex items-center gap-2.5 py-1.5 px-2.5 rounded-lg cursor-pointer transition-all duration-150 hover:bg-muted/40 ${
          !isActive && !node.isRoot ? 'opacity-40' : ''
        }`}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {/* Expand icon */}
        <div className="w-5 h-5 flex items-center justify-center shrink-0">
          {hasChildren ? (
            <motion.div
              animate={{ rotate: expanded ? 90 : 0 }}
              transition={{ duration: 0.15 }}
            >
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            </motion.div>
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-border" />
          )}
        </div>

        {/* Avatar */}
        <Avatar className="h-7 w-7 shrink-0">
          {agent?.avatar_url && <AvatarImage src={agent.avatar_url} alt={node.name} />}
          <AvatarFallback
            className={`text-[10px] font-semibold ${
              node.isRoot ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
            }`}
          >
            {node.isRoot ? '★' : initials}
          </AvatarFallback>
        </Avatar>

        {/* Name & metadata */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={`text-sm truncate ${node.isRoot ? 'font-bold text-primary' : 'font-medium text-foreground'}`}>
            {node.name}
          </span>
          {agent && (
            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-[16px] shrink-0 ${TIER_BADGE_COLORS[agent.tier] || TIER_BADGE_COLORS[1]}`}>
              T{agent.tier}
            </Badge>
          )}
          {!isActive && agent && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-[16px] shrink-0 bg-destructive/[0.08] text-destructive/70 border-destructive/[0.15]">
              Left
            </Badge>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-2 shrink-0">
          {agent?.network_size != null && agent.network_size > 0 && (
            <span className="text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded font-medium">
              {agent.network_size}
            </span>
          )}
          {hasChildren && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 font-medium">
              <Users className="w-3 h-3" />
              {node.children.length}
            </span>
          )}
        </div>
      </div>

      {/* Children */}
      <AnimatePresence>
        {expanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className={`ml-5 pl-3.5 border-l-2 ${tierColor}`}>
              {node.children.map(child => (
                <TreeNodeComponent key={child.agent?.id || child.name} node={child} depth={depth + 1} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SponsorTree({ agents }: SponsorTreeProps) {
  const tree = useMemo(() => buildTree(agents), [agents]);

  const stats = useMemo(() => {
    const sponsorCounts: Record<string, number> = {};
    agents.forEach(a => {
      if (a.sponsor_name) sponsorCounts[a.sponsor_name] = (sponsorCounts[a.sponsor_name] || 0) + 1;
    });
    const topSponsor = Object.entries(sponsorCounts).sort((a, b) => b[1] - a[1])[0];
    const maxDepth = (function getDepth(node: TreeNode): number {
      if (node.children.length === 0) return 0;
      return 1 + Math.max(...node.children.map(getDepth));
    })(tree);

    return {
      totalConnections: agents.filter(a => a.sponsor_name).length,
      uniqueSponsors: new Set(agents.map(a => a.sponsor_name).filter(Boolean)).size,
      topSponsor: topSponsor ? { name: topSponsor[0], count: topSponsor[1] } : null,
      maxDepth,
    };
  }, [agents, tree]);

  const tierCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    agents.forEach(a => { counts[a.tier] = (counts[a.tier] || 0) + 1; });
    return Object.entries(counts).map(([t, c]) => ({ tier: Number(t), count: c })).sort((a, b) => a.tier - b.tier);
  }, [agents]);

  if (agents.length === 0) {
    return (
      <Card className="border-border/40 shadow-sm">
        <CardContent className="py-12">
          <div className="text-center">
            <GitBranch className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No agents in your network yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Sync your platform to see the sponsor tree</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/40 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-primary" />
          Sponsor Tree
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats bar */}
        <div className="flex flex-wrap gap-2">
          {[
            { icon: Link2, label: 'Connections', value: stats.totalConnections },
            { icon: Users, label: 'Sponsors', value: stats.uniqueSponsors },
            { icon: Layers, label: 'Depth', value: `${stats.maxDepth} levels` },
            ...(stats.topSponsor ? [{ icon: Crown, label: 'Top', value: `${stats.topSponsor.name} (${stats.topSponsor.count})` }] : []),
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border/20 text-xs">
              <s.icon className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">{s.label}:</span>
              <span className="font-semibold text-foreground">{s.value}</span>
            </div>
          ))}
        </div>

        {/* Tier legend */}
        <div className="flex flex-wrap gap-3">
          {tierCounts.map(({ tier, count }) => (
            <div key={tier} className="flex items-center gap-1.5 text-xs">
              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-[16px] ${TIER_BADGE_COLORS[tier]}`}>
                T{tier}
              </Badge>
              <span className="text-muted-foreground">{count}</span>
            </div>
          ))}
        </div>

        {/* Tree */}
        <div className="rounded-xl border border-border/30 bg-muted/10 p-3 max-h-[600px] overflow-y-auto">
          <TreeNodeComponent node={tree} depth={0} />
        </div>
      </CardContent>
    </Card>
  );
}

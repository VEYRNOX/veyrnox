// @ts-nocheck
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";

import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { FileText, Search, Download, Sparkles } from "lucide-react";
import { exportCataloguePdf } from "@/lib/pdfExport";
import { FEATURE_CATEGORIES, STATUS, resolveStatus, verifiedFeatureNames } from "@/lib/featureCatalogue";
import { useTier } from "@/lib/TierProvider";
import { toast } from "sonner";

// Three honest states, derived (not re-typed): see src/lib/featureCatalogue.js.
//   verified — real on-chain testnet txid (docs/verified-evidence.json); teal.
//   built    — code-complete and working, unproven on-chain; amber.
//   roadmap  — specced, not built; neutral.
// One colour per state, no stacking (Veyrnox design-system tokens).
const STATUS_META = {
  [STATUS.VERIFIED]: { label: "Verified", className: "bg-accent/10 text-accent border-accent/20" },
  [STATUS.BUILT]: { label: "Built", className: "bg-caution/10 text-caution border-caution/20" },
  [STATUS.ROADMAP]: { label: "Roadmap", className: "bg-muted text-muted-foreground border-border" },
};

export default function Features() {
  const [searchTerm, setSearchTerm] = useState("");
  const { currentTier } = useTier();
  const planName = currentTier === "safety_plus" ? "Safety Plus" : "Free";

  const featureCategories = FEATURE_CATEGORIES;
  // Resolve once: `verified` is honoured only with a txid evidence entry, so a
  // code-ready feature can never render as verified by inspection.
  const verifiedNames = verifiedFeatureNames();
  const statusOf = (feature) => resolveStatus(feature, verifiedNames);

  const filteredCategories = featureCategories
    .map(cat => ({
      ...cat,
      features: cat.features.filter(feature =>
        feature.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        feature.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
        feature.explanation.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }))
    .filter(cat => cat.features.length > 0);

  const allFeatures = featureCategories.flatMap(cat => cat.features);
  const totalFeatures = allFeatures.length;
  const verifiedCount = allFeatures.filter(f => statusOf(f) === STATUS.VERIFIED).length;
  const builtCount = allFeatures.filter(f => statusOf(f) === STATUS.BUILT).length;
  const roadmapCount = allFeatures.filter(f => statusOf(f) === STATUS.ROADMAP).length;

  return (
    <div className="max-w-[1800px] mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">VEYRNOX Features</h1>
          <p className="text-muted-foreground mt-1">
            {totalFeatures} in-scope features across {featureCategories.length} categories — a focused,
            non-custodial, security-first self-custody wallet.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="outline" className={STATUS_META[STATUS.VERIFIED].className}>{verifiedCount} Verified</Badge>
            <Badge variant="outline" className={STATUS_META[STATUS.BUILT].className}>{builtCount} Built</Badge>
            <Badge variant="outline" className={STATUS_META[STATUS.ROADMAP].className}>{roadmapCount} Roadmap</Badge>
            <Badge variant="outline">{featureCategories.length} Categories</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2 max-w-3xl">
            Scope follows docs/WalletFeatures.spec.md. Only self-custody-safe features are listed.
            Custodial / regulated features (swaps, perps, staking/yield/lending, fiat ramps, bank links,
            KYC/DID, NFT minting, etc.) are deliberately not built. Status is three honest states:{" "}
            <b>verified</b> means exercised against a real on-chain txid (testnet, or mainnet for shipped assets); <b>built</b> means
            code-complete and working, but not yet proven on-chain
            (code-ready ≠ verified); <b>roadmap</b> means specced, not built. Mainnet was unlocked
            2026-06-17.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <FileText className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button onClick={() => {
            try {
              exportCataloguePdf({
                title: "Feature Catalogue",
                subtitle: "Scope follows docs/WalletFeatures.spec.md — only self-custody-safe features are listed. Status is verified (real on-chain testnet txid) / built (code-complete, unproven on-chain) / roadmap (specced). Mainnet unlocked 2026-06-17.",
                categories: featureCategories.map(c => ({
                  category: c.category,
                  items: c.features.map(f => ({ name: f.name, desc: f.summary, status: statusOf(f) })),
                })),
              });
              toast.success("Feature catalogue PDF downloaded");
            } catch (error) {
              console.error("PDF generation failed:", error);
              toast.error("Failed to generate documentation");
            }
          }}>
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Current plan — reflects the real entitlement from TierProvider (useTier). */}
      <Link to="/plans" className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-primary shrink-0" />
          <p className="text-sm font-medium">Current plan: {planName}</p>
        </div>
        <span className="text-sm text-primary font-medium">View plans</span>
      </Link>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search features..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Features by Category */}
      <div className="space-y-4">
        {filteredCategories.map((category) => (
          <Card key={category.category}>
            <CardHeader>
              <CardTitle>{category.category}</CardTitle>
              <CardDescription>{category.features.length} features</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[250px]">Feature</TableHead>
                      <TableHead className="w-[120px]">Status</TableHead>
                      <TableHead className="w-[280px]">Summary</TableHead>
                      <TableHead>Explanation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {category.features.map((feature) => {
                      const status = statusOf(feature);
                      return (
                        <TableRow key={feature.name}>
                          <TableCell className="font-semibold">{feature.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={STATUS_META[status].className}>
                              {STATUS_META[status].label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{feature.summary}</TableCell>
                          <TableCell className="text-sm">{feature.explanation}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredCategories.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No features found matching "{searchTerm}"
          </CardContent>
        </Card>
      )}
    </div>
  );
}

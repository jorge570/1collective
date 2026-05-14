import type { LucideIcon } from "lucide-react";
import { Inbox, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Stat = { label: string; value: string; helper?: string };
type Section = { key: string; label: string; body: React.ReactNode };

export function ModuleShellPreview({
  title,
  description,
  primaryActionLabel,
  stats,
  sections,
  emptyTitle,
  emptyHint,
}: {
  title: string;
  description: string;
  primaryActionLabel: string;
  stats: Stat[];
  sections?: Section[];
  emptyTitle: string;
  emptyHint: string;
}) {
  const tabs: Section[] = sections ?? [
    {
      key: "overview",
      label: "Overview",
      body: <DefaultEmpty icon={Inbox} title={emptyTitle} hint={emptyHint} />,
    },
    {
      key: "settings",
      label: "Settings",
      body: (
        <DefaultEmpty
          icon={Lock}
          title="Configuration is locked"
          hint="Settings unlock once this module is enabled for your workspace."
        />
      ),
    },
  ];

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <Badge variant="secondary">Preview</Badge>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted-foreground)]">
            {description}
          </p>
        </div>
        <Button disabled title="Available in an upcoming release">
          {primaryActionLabel}
        </Button>
      </div>

      {stats.length > 0 && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardHeader className="pb-2">
                <CardDescription>{s.label}</CardDescription>
                <CardTitle className="text-2xl">{s.value}</CardTitle>
              </CardHeader>
              {s.helper && (
                <CardContent className="pt-0 text-xs text-[var(--color-muted-foreground)]">
                  {s.helper}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      <Tabs defaultValue={tabs[0].key} className="mt-8">
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((t) => (
          <TabsContent key={t.key} value={t.key} className="mt-4">
            {t.body}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function DefaultEmpty({
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <Icon className="h-10 w-10 text-[var(--color-muted-foreground)]" />
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

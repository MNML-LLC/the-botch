#!/bin/bash

mkdir -p components/dashboard components/events components/participants components/stats

# Dashboard Card
cat <<'EOF' > components/dashboard/summary-card.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SummaryCardProps = {
  title: string;
  value: string | number;
};

export default function SummaryCard({ title, value }: SummaryCardProps) {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
EOF

# Event Card
cat <<'EOF' > components/events/event-card.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type EventCardProps = {
  name: string;
  date: string;
  participants: number;
  host: string;
};

export default function EventCard({ name, date, participants, host }: EventCardProps) {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{name}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Date: {date}</p>
        <p className="text-sm text-muted-foreground">Host: {host}</p>
        <p className="text-sm text-muted-foreground">Participants: {participants}</p>
      </CardContent>
    </Card>
  );
}
EOF

# Participant Card
cat <<'EOF' > components/participants/participant-card.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ParticipantCardProps = {
  name: string;
  nickname?: string;
  totalWins: number;
};

export default function ParticipantCard({ name, nickname, totalWins }: ParticipantCardProps) {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{name} {nickname && `(${nickname})`}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Total Wins: {totalWins}</p>
      </CardContent>
    </Card>
  );
}
EOF

# Stats Graph
cat <<'EOF' > components/stats/stats-graph.tsx
"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type StatsGraphProps = {
  data: { name: string; value: number }[];
};

export default function StatsGraph({ data }: StatsGraphProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="value" fill="#8884d8" />
      </BarChart>
    </ResponsiveContainer>
  );
}
EOF

# Stats Table
cat <<'EOF' > components/stats/stats-table.tsx
type StatsTableProps = {
  data: { key: string; value: string | number }[];
};

export default function StatsTable({ data }: StatsTableProps) {
  return (
    <table className="w-full text-sm text-left">
      <tbody>
        {data.map((item) => (
          <tr key={item.key}>
            <td className="py-2 pr-4 font-medium">{item.key}</td>
            <td>{item.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
EOF

echo "✅ Step3 コンポーネント一括実装完了！"


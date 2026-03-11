#!/bin/bash

# 男気じゃんけん管理アプリ - エラー修正スクリプト
# 実行方法: bash fix-errors.sh

set -e  # エラーが発生したらスクリプトを停止

echo "⚡ 男気じゃんけん管理アプリ エラー修正スクリプトを開始します ⚡"

# 1. Prisma型定義の修正
echo "🔧 Prisma型定義を修正しています..."
cat > types/index.ts << 'EOF'
import { Prisma } from '@prisma/client';

// Prismaが自動生成する型定義を使用
export type Event = Prisma.EventGetPayload<{}>;
export type Participant = Prisma.ParticipantGetPayload<{}>;
export type Participation = Prisma.ParticipationGetPayload<{}>;

// イベントと関連する参加記録を含む拡張タイプ
export type EventWithParticipations = Prisma.EventGetPayload<{
  include: {
    participations: {
      include: {
        participant: true;
      };
    };
  };
}>;

// 参加者と統計情報を含む拡張タイプ
export type ParticipantWithStats = Prisma.ParticipantGetPayload<{
  include: {
    participations: {
      include: {
        event: true;
      };
    };
  };
}> & {
  winRate: number;
  totalEvents: number;
  netBalance: number;
};

// フォーム用の型定義
export type EventFormData = Omit<Event, 'id' | 'createdAt' | 'updatedAt'>;
export type ParticipantFormData = Omit<Participant, 'id' | 'createdAt' | 'updatedAt'>;
export type JankenFormData = {
  winnerId: string;
  loserId: string;
  winnerChoice: string;
  loserChoice: string;
  amount: number;
};
EOF

# 2. shadcn/uiのtoastコンポーネントを追加
echo "🎨 Toast UIコンポーネントを追加しています..."
mkdir -p components/ui
cat > components/ui/use-toast.ts << 'EOF'
// Inspired by react-hot-toast library
import * as React from "react"

import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast"

const TOAST_LIMIT = 5
const TOAST_REMOVE_DELAY = 5000

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

type ActionType = typeof actionTypes

type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast> & { id: string }
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: string
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: string
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        if (toastTimeouts.has(toastId)) {
          clearTimeout(toastTimeouts.get(toastId))
          toastTimeouts.delete(toastId)
        }
      } else {
        for (const [id, timeout] of toastTimeouts.entries()) {
          clearTimeout(timeout)
          toastTimeouts.delete(id)
        }
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const useToast = () => {
  const [state, dispatch] = React.useReducer(reducer, {
    toasts: [],
  })

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dispatch({
          type: "DISMISS_TOAST",
        })
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const toast = React.useMemo(
    () => ({
      ...state,
      toast: (props: Omit<ToasterToast, "id">) => {
        const id = crypto.randomUUID()
        const newToast = { id, ...props }

        dispatch({
          type: "ADD_TOAST",
          toast: newToast,
        })

        return id
      },
      update: (id: string, props: Partial<Omit<ToasterToast, "id">>) => {
        if (!id) return

        dispatch({
          type: "UPDATE_TOAST",
          toast: { id, ...props },
        })
      },
      dismiss: (toastId?: string) => {
        dispatch({
          type: "DISMISS_TOAST",
          toastId,
        })
      },
      remove: (toastId?: string) => {
        dispatch({
          type: "REMOVE_TOAST",
          toastId,
        })
      },
    }),
    [state]
  )

  return toast
}

type Toast = ReturnType<typeof useToast>

const ToastContext = React.createContext<Toast | null>(null)

function ToastProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const toast = useToast()

  return (
    <ToastContext.Provider value={toast}>
      {children}
    </ToastContext.Provider>
  )
}

function useToastContext() {
  const context = React.useContext(ToastContext)

  if (context === null) {
    throw new Error("useToast must be used within a ToastProvider")
  }

  return context
}

export {
  useToast,
  useToastContext,
  ToastProvider,
}
EOF

cat > components/ui/toast.tsx << 'EOF'
import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const ToastProvider = ToastPrimitives.Provider

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full",
  {
    variants: {
      variant: {
        default: "border bg-background text-foreground",
        destructive:
          "destructive group border-destructive bg-destructive text-destructive-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  )
})
Toast.displayName = ToastPrimitives.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive",
      className
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100 group-[.destructive]:text-red-300 group-[.destructive]:hover:text-red-50 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-sm font-semibold", className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("text-sm opacity-90", className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>

type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}
EOF

cat > components/ui/toaster.tsx << 'EOF'
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { useToastContext } from "@/components/ui/use-toast"

export function Toaster() {
  const { toasts } = useToastContext()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
EOF

# 3. lib/utils/participations.tsの修正
echo "📝 参加記録ユーティリティを修正しています..."
cat > lib/utils/participations.ts << 'EOF'
import type { Participation } from '@/types';

export async function getParticipationsByEventId(eventId: string): Promise<Participation[]> {
  const response = await fetch(`/api/events/${eventId}/participations`);
  if (!response.ok) {
    throw new Error('参加記録の取得に失敗しました');
  }
  return response.json();
}

export async function createParticipation(participationData: Omit<Participation, 'id' | 'createdAt' | 'updatedAt'>): Promise<Participation> {
  const response = await fetch('/api/participations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(participationData),
  });

  if (!response.ok) {
    throw new Error('参加記録の作成に失敗しました');
  }
  return response.json();
}

export async function updateParticipation(id: string, participationData: Partial<Participation>): Promise<Participation> {
  const response = await fetch(`/api/participations/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(participationData),
  });

  if (!response.ok) {
    throw new Error('参加記録の更新に失敗しました');
  }
  return response.json();
}

export async function recordJankenResult(
  eventId: string,
  winnerId: string,
  loserId: string,
  winnerChoice: string,
  loserChoice: string,
  amount: number
): Promise<void> {
  const response = await fetch(`/api/events/${eventId}/janken`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      winnerId,
      loserId,
      winnerChoice,
      loserChoice,
      amount
    }),
  });

  if (!response.ok) {
    throw new Error('じゃんけん結果の記録に失敗しました');
  }
}
EOF

# 4. lib/utils/participants.tsの修正
echo "📝 参加者ユーティリティを修正しています..."
cat > lib/utils/participants.ts << 'EOF'
import type { Participant, ParticipantWithStats } from '@/types';

export async function getAllParticipants(): Promise<Participant[]> {
  const response = await fetch('/api/participants');
  if (!response.ok) {
    throw new Error('参加者の取得に失敗しました');
  }
  return response.json();
}

export async function getParticipantById(id: string): Promise<ParticipantWithStats | null> {
  const response = await fetch(`/api/participants/${id}`);
  if (!response.ok) {
    throw new Error('参加者の取得に失敗しました');
  }
  return response.json();
}

export async function createParticipant(participantData: Omit<Participant, 'id' | 'createdAt' | 'updatedAt'>): Promise<Participant> {
  const response = await fetch('/api/participants', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(participantData),
  });

  if (!response.ok) {
    throw new Error('参加者の作成に失敗しました');
  }
  return response.json();
}

export async function updateParticipant(id: string, participantData: Partial<Participant>): Promise<Participant> {
  const response = await fetch(`/api/participants/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(participantData),
  });

  if (!response.ok) {
    throw new Error('参加者の更新に失敗しました');
  }
  return response.json();
}

export async function deleteParticipant(id: string): Promise<void> {
  const response = await fetch(`/api/participants/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('参加者の削除に失敗しました');
  }
}
EOF

# 5. lib/utils/events.tsの修正
echo "📝 イベントユーティリティを修正しています..."
cat > lib/utils/events.ts << 'EOF'
import type { Event, EventWithParticipations } from '@/types';

export async function getAllEvents(): Promise<Event[]> {
  const response = await fetch('/api/events');
  if (!response.ok) {
    throw new Error('イベントの取得に失敗しました');
  }
  return response.json();
}

export async function getEventById(id: string): Promise<EventWithParticipations | null> {
  const response = await fetch(`/api/events/${id}`);
  if (!response.ok) {
    throw new Error('イベントの取得に失敗しました');
  }
  return response.json();
}

export async function createEvent(eventData: Omit<Event, 'id' | 'createdAt' | 'updatedAt'>): Promise<Event> {
  const response = await fetch('/api/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventData),
  });

  if (!response.ok) {
    throw new Error('イベントの作成に失敗しました');
  }
  return response.json();
}

export async function updateEvent(id: string, eventData: Partial<Event>): Promise<Event> {
  const response = await fetch(`/api/events/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventData),
  });

  if (!response.ok) {
    throw new Error('イベントの更新に失敗しました');
  }
  return response.json();
}

export async function deleteEvent(id: string): Promise<void> {
  const response = await fetch(`/api/events/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('イベントの削除に失敗しました');
  }
}
EOF

# 6. janken-form.tsxの構文エラー修正
echo "🔧 じゃんけんフォームの構文エラーを修正しています..."
cat > components/events/janken-form.tsx << 'EOF'
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { Participant } from "@/types";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { recordJankenResult } from "@/lib/utils/participations";

const jankenSchema = z.object({
  winnerId: z.string().min(1, "勝者は必須です"),
  loserId: z.string().min(1, "敗者は必須です"),
  winnerChoice: z.enum(["グー", "チョキ", "パー"], {
    required_error: "勝者の手は必須です",
  }),
  loserChoice: z.enum(["グー", "チョキ", "パー"], {
    required_error: "敗者の手は必須です",
  }),
  amount: z.coerce.number().min(1, "金額は1円以上で入力してください"),
});

type JankenFormProps = {
  eventId: string;
  participants: Participant[];
};

export function JankenForm({ eventId, participants }: JankenFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof jankenSchema>>({
    resolver: zodResolver(jankenSchema),
    defaultValues: {
      winnerId: "",
      loserId: "",
      winnerChoice: undefined,
      loserChoice: undefined,
      amount: 1000,
    },
  });

  const winnerId = form.watch("winnerId");
  const loserId = form.watch("loserId");

  const onSubmit = async (data: z.infer<typeof jankenSchema>) => {
    if (data.winnerId === data.loserId) {
      form.setError("loserId", {
        type: "manual",
        message: "勝者と敗者は異なる人を選択してください",
      });
      return;
    }

    // じゃんけんの手の整合性をチェック
    const validCombinations = [
      { winner: "グー", loser: "チョキ" },
      { winner: "チョキ", loser: "パー" },
      { winner: "パー", loser: "グー" },
    ];

    const isValidCombination = validCombinations.some(
      combo => combo.winner === data.winnerChoice && combo.loser === data.loserChoice
    );

    if (!isValidCombination) {
      form.setError("loserChoice", {
        type: "manual",
        message: `${data.winnerChoice}は${data.loserChoice}に勝てません`,
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await recordJankenResult(
        eventId,
        data.winnerId,
        data.loserId,
        data.winnerChoice,
        data.loserChoice,
        data.amount
      );

      toast({
        title: "じゃんけん結果を記録しました",
        description: `${participants.find(p => p.id === data.winnerId)?.name}の勝ち (${data.amount.toLocaleString()}円)`,
      });

      // フォームをリセット
      form.reset({
        winnerId: "",
        loserId: "",
        winnerChoice: undefined,
        loserChoice: undefined,
        amount: 1000,
      });

      // 画面を更新
      router.refresh();
    } catch (error) {
      console.error("Failed to record janken result:", error);
      toast({
        title: "エラーが発生しました",
        description: "じゃんけん結果の記録に失敗しました。後でもう一度お試しください。",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="winnerId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>勝者</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="勝者を選択" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {participants.map((participant) => (
                      <SelectItem
                        key={participant.id}
                        value={participant.id}
                        disabled={participant.id === loserId}
                      >
                        {participant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="loserId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>敗者</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="敗者を選択" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {participants.map((participant) => (
                      <SelectItem
                        key={participant.id}
                        value={participant.id}
                        disabled={participant.id === winnerId}
                      >
                        {participant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="winnerChoice"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel>勝者の手</FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    className="flex space-x-4"
                  >
                    <FormItem className="flex items-center space-x-1 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="グー" />
                      </FormControl>
                      <FormLabel className="font-normal cursor-pointer">
                        グー
                      </FormLabel>
                    </FormItem>
                    <FormItem className="flex items-center space-x-1 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="チョキ" />
                      </FormControl>
                      <FormLabel className="font-normal cursor-pointer">
                        チョキ
                      </FormLabel>
                    </FormItem>
                    <FormItem className="flex items-center space-x-1 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="パー" />
                      </FormControl>
                      <FormLabel className="font-normal cursor-pointer">
                        パー
                      </FormLabel>
                    </FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="loserChoice"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel>敗者の手</FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    className="flex space-x-4"
                  >
                    <FormItem className="flex items-center space-x-1 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="グー" />
                      </FormControl>
                      <FormLabel className="font-normal cursor-pointer">
                        グー
                      </FormLabel>
                    </FormItem>
                    <FormItem className="flex items-center space-x-1 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="チョキ" />
                      </FormControl>
                      <FormLabel className="font-normal cursor-pointer">
                        チョキ
                      </FormLabel>
                    </FormItem>
                    <FormItem className="flex items-center space-x-1 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="パー" />
                      </FormControl>
                      <FormLabel className="font-normal cursor-pointer">
                        パー
                      </FormLabel>
                    </FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>金額</FormLabel>
              <FormControl>
                <div className="flex items-center">
                  <Input
                    type="number"
                    min={1}
                    step={100}
                    {...field}
                    className="w-32"
                  />
                  <span className="ml-2">円</span>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "記録中..." : "じゃんけん結果を記録"}
        </Button>
      </form>
    </Form>
  );
}
EOF

# 7. event-form.tsxの修正
echo "🔧 イベントフォームを修正しています..."
cat > components/events/event-form.tsx << 'EOF'
"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { createEvent, updateEvent } from "@/lib/utils/events";
import type { EventFormData } from "@/types";

const eventSchema = z.object({
  name: z.string().min(1, "イベント名は必須です"),
  date: z.string().min(1, "日付は必須です"),
  location: z.string().optional(),
  description: z.string().optional(),
  totalAmount: z.number().optional(),
});

type EventFormProps = {
  defaultValues?: EventFormData;
  eventId?: string;
};

export function EventForm({ defaultValues, eventId }: EventFormProps) {
  const router = useRouter();
  const isEditing = !!eventId;

  const form = useForm<z.infer<typeof eventSchema>>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      name: defaultValues?.name || "",
      date: defaultValues?.date
        ? new Date(defaultValues.date).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      location: defaultValues?.location || "",
      description: defaultValues?.description || "",
      totalAmount: defaultValues?.totalAmount || 0,
    },
  });

  const onSubmit = async (data: z.infer<typeof eventSchema>) => {
    try {
      const eventData = {
        ...data,
        date: new Date(data.date),
        totalAmount: data.totalAmount || 0,
      };

      if (isEditing && eventId) {
        await updateEvent(eventId, eventData);
        toast({
          title: "イベントを更新しました",
        });
      } else {
        await createEvent(eventData);
        toast({
          title: "新規イベントを作成しました",
        });
      }

      router.push("/events");
      router.refresh();
    } catch (error) {
      console.error("Failed to save event:", error);
      toast({
        title: "エラーが発生しました",
        description: "イベントの保存に失敗しました。後でもう一度お試しください。",
        variant: "destructive",
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>イベント名</FormLabel>
              <FormControl>
                <Input placeholder="例: 新年会" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>日付</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="location"
          render={({ field }) => (
            <FormItem>
              <FormLabel>場所</FormLabel>
              <FormControl>
                <Input placeholder="例: 居酒屋〇〇" {...field} />
              </FormControl>
              <FormDescription>
                任意の項目です
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>説明</FormLabel>
              <FormControl>
                <Textarea placeholder="イベントの詳細情報" {...field} />
              </FormControl>
              <FormDescription>
                任意の項目です
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            キャンセル
          </Button>
          <Button type="submit">
            {isEditing ? "更新する" : "作成する"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
EOF

# 8. participant-form.tsxの修正
echo "🔧 参加者フォームを修正しています..."
cat > components/participants/participant-form.tsx << 'EOF'
"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { createParticipant, updateParticipant } from "@/lib/utils/participants";
import type { ParticipantFormData } from "@/types";

const participantSchema = z.object({
  name: z.string().min(1, "参加者名は必須です"),
});

type ParticipantFormProps = {
  defaultValues?: ParticipantFormData;
  participantId?: string;
};

export function ParticipantForm({ defaultValues, participantId }: ParticipantFormProps) {
  const router = useRouter();
  const isEditing = !!participantId;

  const form = useForm<z.infer<typeof participantSchema>>({
    resolver: zodResolver(participantSchema),
    defaultValues: {
      name: defaultValues?.name || "",
    },
  });

  const onSubmit = async (data: z.infer<typeof participantSchema>) => {
    try {
      const participantData = {
        ...data,
        winCount: defaultValues?.winCount || 0,
        loseCount: defaultValues?.loseCount || 0,
        totalPaid: defaultValues?.totalPaid || 0,
        totalCollected: defaultValues?.totalCollected || 0,
      };

      if (isEditing && participantId) {
        await updateParticipant(participantId, participantData);
        toast({
          title: "参加者情報を更新しました",
        });
      } else {
        await createParticipant(participantData);
        toast({
          title: "新規参加者を登録しました",
        });
      }

      router.push("/participants");
      router.refresh();
    } catch (error) {
      console.error("Failed to save participant:", error);
      toast({
        title: "エラーが発生しました",
        description: "参加者の保存に失敗しました。後でもう一度お試しください。",
        variant: "destructive",
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>参加者名</FormLabel>
              <FormControl>
                <Input placeholder="例: 山田太郎" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            キャンセル
          </Button>
          <Button type="submit">
            {isEditing ? "更新する" : "登録する"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
EOF

# 9. stats/page.tsxの修正
echo "🔧 統計ページを修正しています..."
cat > app/stats/page.tsx << 'EOF'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import prisma from "@/lib/db/prisma";

export const dynamic = 'force-dynamic'; // キャッシュを無効化して常に最新データを取得

export default async function StatsPage() {
  // 全参加者の統計情報を取得
  const participants = await prisma.participant.findMany({
    orderBy: [
      {
        totalCollected: 'desc',
      },
    ],
  });

  // 収支ランキング計算
  const balanceRanking = participants
    .map((p) => ({
      id: p.id,
      name: p.name,
      balance: p.totalCollected - p.totalPaid,
      totalGames: p.winCount + p.loseCount,
      winRate: p.winCount + p.loseCount > 0 ? (p.winCount / (p.winCount + p.loseCount)) * 100 : 0,
    }))
    .sort((a, b) => b.balance - a.balance);

  // 勝率ランキング計算 (最低5回以上のじゃんけんを行った参加者のみ)
  const minGames = 5;
  const winRateRanking = participants
    .filter((p) => (p.winCount + p.loseCount) >= minGames)
    .map((p) => ({
      id: p.id,
      name: p.name,
      totalGames: p.winCount + p.loseCount,
      winCount: p.winCount,
      loseCount: p.loseCount,
      winRate: (p.winCount / (p.winCount + p.loseCount)) * 100,
    }))
    .sort((a, b) => b.winRate - a.winRate);

  // じゃんけん回数ランキング
  const gameCountRanking = participants
    .map((p) => ({
      id: p.id,
      name: p.name,
      totalGames: p.winCount + p.loseCount,
      winCount: p.winCount,
      loseCount: p.loseCount,
    }))
    .sort((a, b) => b.totalGames - a.totalGames);

  // 総括統計
  const totalStats = await prisma.$transaction([
    prisma.participant.count(),
    prisma.participation.count(),
    prisma.event.aggregate({
      _sum: {
        totalAmount: true,
      },
    }),
  ]);

  const [participantsCount, participationsCount, amountSum] = totalStats;
  const jankenCount = Math.floor(participationsCount / 2); // じゃんけんは勝者と敗者の2レコードで1回分

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">統計情報</h1>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">参加者数</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{participantsCount}人</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">じゃんけん回数</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{jankenCount}回</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">総支払額</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{amountSum._sum.totalAmount?.toLocaleString() || 0}円</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">平均支払額</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {jankenCount > 0
                ? Math.round((amountSum._sum.totalAmount || 0) / jankenCount).toLocaleString()
                : 0}円
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>収支ランキング</CardTitle>
            <CardDescription>獲得金額 - 支払金額</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {balanceRanking.length === 0 ? (
                <p>データがありません</p>
              ) : (
                balanceRanking.map((participant, index) => (
                  <div key={participant.id} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="font-bold mr-2 w-6">{index + 1}.</span>
                      <div>
                        <p>{participant.name}</p>
                        <p className="text-xs text-muted-foreground">
                          勝率: {participant.winRate.toFixed(1)}% ({participant.totalGames}回)
                        </p>
                      </div>
                    </div>
                    <span className={`font-bold ${participant.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {participant.balance.toLocaleString()}円
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>勝率ランキング</CardTitle>
            <CardDescription>{minGames}回以上のじゃんけんを行った参加者</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {winRateRanking.length === 0 ? (
                <p>{minGames}回以上じゃんけんを行った参加者がいません</p>
              ) : (
                winRateRanking.map((participant, index) => (
                  <div key={participant.id} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="font-bold mr-2 w-6">{index + 1}.</span>
                      <div>
                        <p>{participant.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {participant.winCount}勝{participant.loseCount}敗 ({participant.totalGames}回)
                        </p>
                      </div>
                    </div>
                    <span className="font-bold">{participant.winRate.toFixed(1)}%</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>じゃんけん回数ランキング</CardTitle>
            <CardDescription>参加回数が多い順</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {gameCountRanking.length === 0 ? (
                <p>データがありません</p>
              ) : (
                gameCountRanking.map((participant, index) => (
                  <div key={participant.id} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="font-bold mr-2 w-6">{index + 1}.</span>
                      <div>
                        <p>{participant.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {participant.winCount}勝{participant.loseCount}敗
                        </p>
                      </div>
                    </div>
                    <span className="font-bold">{participant.totalGames}回</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
EOF

# 10. events/page.tsxの修正
echo "🔧 イベント一覧ページを修正しています..."
cat > app/events/page.tsx << 'EOF'
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import prisma from "@/lib/db/prisma";
import { formatDate } from "@/lib/utils";

export const dynamic = 'force-dynamic'; // キャッシュを無効化して常に最新データを取得

export default async function DashboardPage() {
  // 最近のイベント（最新3件）
  const recentEvents = await prisma.event.findMany({
    orderBy: {
      date: 'desc',
    },
    take: 3,
  });

  // 次回のイベント
  const upcomingEvent = await prisma.event.findFirst({
    where: {
      date: {
        gte: new Date(),
      },
    },
    orderBy: {
      date: 'asc',
    },
  });

  // 収支上位の参加者
  const topParticipants = await prisma.participant.findMany({
    orderBy: [
      {
        totalCollected: 'desc',
      },
    ],
    take: 5,
  });

  // トータル統計
  const totalStats = await prisma.$transaction([
    prisma.event.count(),
    prisma.participant.count(),
    prisma.participation.count(),
    prisma.event.aggregate({
      _sum: {
        totalAmount: true,
      },
    }),
  ]);

  const [eventsCount, participantsCount, participationsCount, totalAmount] = totalStats;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">ダッシュボード</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">イベント数</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{eventsCount}件</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">参加者数</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{participantsCount}人</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">じゃんけん回数</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{Math.floor(participationsCount / 2)}回</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">総支払額</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalAmount._sum.totalAmount?.toLocaleString() || 0}円</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>次回のイベント</CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingEvent ? (
                <>
                  <h3 className="text-lg font-bold">{upcomingEvent.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(upcomingEvent.date)}
                    {upcomingEvent.location && ` @ ${upcomingEvent.location}`}
                  </p>
                  {upcomingEvent.description && (
                    <p className="mt-2">{upcomingEvent.description}</p>
                  )}
                </>
              ) : (
                <p>予定されているイベントはありません。</p>
              )}
            </CardContent>
            {upcomingEvent && (
              <CardFooter>
                <Link href={`/events/${upcomingEvent.id}`} className="w-full">
                  <Button variant="outline" className="w-full">
                    詳細を見る
                  </Button>
                </Link>
              </CardFooter>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>収支上位参加者</CardTitle>
              <CardDescription>獲得金額が多い順</CardDescription>
            </CardHeader>
            <CardContent>
              {topParticipants.length === 0 ? (
                <p>参加者がまだ登録されていません。</p>
              ) : (
                <div className="space-y-4">
                  {topParticipants.map((participant) => {
                    const netBalance = participant.totalCollected - participant.totalPaid;
                    return (
                      <div key={participant.id} className="flex justify-between items-center">
                        <div>
                          <p className="font-medium">{participant.name}</p>
                          <p className="text-sm text-muted-foreground">
                            勝率: {participant.winCount + participant.loseCount > 0
                              ? Math.round((participant.winCount / (participant.winCount + participant.loseCount)) * 100)
                              : 0}%
                          </p>
                        </div>
                        <p className={`font-bold ${netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {netBalance.toLocaleString()}円
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>最近のイベント</CardTitle>
          </CardHeader>
          <CardContent>
            {recentEvents.length === 0 ? (
              <p>イベントがまだ登録されていません。</p>
            ) : (
              <div className="space-y-4">
                {recentEvents.map((event) => (
                  <div key={event.id}>
                    <div className="flex justify-between items-start">
                      <div>
                        <Link href={`/events/${event.id}`}>
                          <h3 className="font-bold hover:underline">{event.name}</h3>
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(event.date)}
                          {event.location && ` @ ${event.location}`}
                        </p>
                      </div>
                      <p className="font-bold">{event.totalAmount?.toLocaleString() || 0}円</p>
                    </div>
                    {event.description && (
                      <p className="mt-1 text-sm">{event.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Link href="/events" className="w-full">
              <Button variant="outline" className="w-full">
                すべてのイベントを見る
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
EOFd, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import prisma from "@/lib/db/prisma";
import { formatDate } from "@/lib/utils";

export const dynamic = 'force-dynamic'; // キャッシュを無効化して常に最新データを取得

export default async function EventsPage() {
  const events = await prisma.event.findMany({
    orderBy: {
      date: 'desc',
    },
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">イベント一覧</h1>
        <Link href="/events/new">
          <Button>新規イベント作成</Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {events.length === 0 ? (
          <p>イベントがまだ登録されていません。</p>
        ) : (
          events.map((event) => (
            <Card key={event.id}>
              <CardHeader>
                <CardTitle>{event.name}</CardTitle>
                <CardDescription>
                  {formatDate(event.date)}
                  {event.location && ` @ ${event.location}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {event.description && <p className="text-sm">{event.description}</p>}
                {event.totalAmount !== null && (
                  <p className="mt-2 font-bold">
                    総額: {event.totalAmount.toLocaleString()}円
                  </p>
                )}
              </CardContent>
              <CardFooter>
                <Link href={`/events/${event.id}`} className="w-full">
                  <Button variant="outline" className="w-full">詳細を見る</Button>
                </Link>
              </CardFooter>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
EOF

# 11. events/[id]/page.tsxの修正
echo "🔧 イベント詳細ページを修正しています..."
cat > app/events/[id]/page.tsx << 'EOF'
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JankenForm } from "@/components/events/janken-form";
import prisma from "@/lib/db/prisma";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export const dynamic = 'force-dynamic'; // キャッシュを無効化して常に最新データを取得

interface EventPageProps {
  params: {
    id: string;
  };
}

export default async function EventPage({ params }: EventPageProps) {
  const eventId = params.id;
  
  // イベント詳細とそれに紐づく参加記録を取得
  const event = await prisma.event.findUnique({
    where: {
      id: eventId,
    },
    include: {
      participations: {
        include: {
          participant: true,
        },
      },
    },
  });

  if (!event) {
    return notFound();
  }

  // 全参加者を取得
  const allParticipants = await prisma.participant.findMany({
    orderBy: {
      name: 'asc',
    },
  });

  // じゃんけん結果一覧に表示するデータを整形
  const jankenResults = event.participations
    .filter((p) => p.isWinner === true) // 勝者の記録のみ抽出
    .map((p) => {
      // 対応する敗者を探す
      const loserParticipation = event.participations.find(
        (lp) => lp.isWinner === false && lp.jankenChoiceLoser && p.jankenChoiceWinner
      );
      
      if (!loserParticipation) return null;
      
      const loser = allParticipants.find((ap) => ap.id === loserParticipation.participantId);
      
      return {
        id: p.id,
        winner: p.participant.name,
        loser: loser?.name || '不明',
        winnerChoice: p.jankenChoiceWinner,
        loserChoice: loserParticipation.jankenChoiceLoser,
        amount: loserParticipation.amountPaid,
      };
    })
    .filter(Boolean); // nullを除外

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{event.name}</h1>
        <Link href="/events">
          <Button variant="outline">イベント一覧に戻る</Button>
        </Link>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>イベント詳細</CardTitle>
          <CardDescription>
            {formatDate(event.date)}
            {event.location && ` @ ${event.location}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {event.description && <p className="mb-4">{event.description}</p>}
          <p className="font-bold text-lg">
            総支払額: {event.totalAmount?.toLocaleString() || 0}円
          </p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>じゃんけん結果登録</CardTitle>
        </CardHeader>
        <CardContent>
          <JankenForm eventId={eventId} participants={allParticipants} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>じゃんけん結果一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {jankenResults.length === 0 ? (
            <p>まだじゃんけん結果が登録されていません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">勝者</th>
                    <th className="text-left py-2">敗者</th>
                    <th className="text-left py-2">勝者の手</th>
                    <th className="text-left py-2">敗者の手</th>
                    <th className="text-right py-2">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {jankenResults.map((result, index) => (
                    <tr key={index} className="border-b">
                      <td className="py-2">{result.winner}</td>
                      <td className="py-2">{result.loser}</td>
                      <td className="py-2">{result.winnerChoice}</td>
                      <td className="py-2">{result.loserChoice}</td>
                      <td className="py-2 text-right">{result.amount.toLocaleString()}円</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
EOF

# 12. participants/page.tsxの修正
echo "🔧 参加者一覧ページを修正しています..."
cat > app/participants/page.tsx << 'EOF'
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import prisma from "@/lib/db/prisma";

export const dynamic = 'force-dynamic'; // キャッシュを無効化して常に最新データを取得

export default async function ParticipantsPage() {
  const participants = await prisma.participant.findMany({
    orderBy: {
      name: 'asc',
    },
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">参加者一覧</h1>
        <Link href="/participants/new">
          <Button>新規参加者登録</Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {participants.length === 0 ? (
          <p>参加者がまだ登録されていません。</p>
        ) : (
          participants.map((participant) => {
            const totalGames = participant.winCount + participant.loseCount;
            const winRate = totalGames > 0 ? Math.round((participant.winCount / totalGames) * 100) : 0;
            const netBalance = participant.totalCollected - participant.totalPaid;

            return (
              <Card key={participant.id}>
                <CardHeader>
                  <CardTitle>{participant.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-sm text-muted-foreground">勝率</p>
                      <p className="font-bold">{winRate}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">試合数</p>
                      <p className="font-bold">{totalGames}回</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">獲得金額</p>
                      <p className="font-bold">{participant.totalCollected.toLocaleString()}円</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">支払金額</p>
                      <p className="font-bold">{participant.totalPaid.toLocaleString()}円</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <p className="text-sm text-muted-foreground">収支</p>
                    <p className={`font-bold ${netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {netBalance.toLocaleString()}円
                    </p>
                  </div>
                </CardContent>
                <CardFooter>
                  <Link href={`/participants/${participant.id}`} className="w-full">
                    <Button variant="outline" className="w-full">詳細を見る</Button>
                  </Link>
                </CardFooter>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
EOF

# 13. ダッシュボードの修正
echo "🔧 ダッシュボードを修正しています..."
cat > app/page.tsx << 'EOF'
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Car#!/bin/bash

# 男気じゃんけん管理アプリ - エラー修正スクリプト
# 実行方法: bash fix-errors.sh

set -e  # エラーが発生したらスクリプトを停止

echo "⚡ 男気じゃんけん管理アプリ エラー修正スクリプトを開始します ⚡"

# 1. Prisma型定義の修正
echo "🔧 Prisma型定義を修正しています..."
cat > types/index.ts << 'EOF'
import { Prisma } from '@prisma/client';

// Prismaが自動生成する型定義を使用
export type Event = Prisma.EventGetPayload<{}>;
export type Participant = Prisma.ParticipantGetPayload<{}>;
export type Participation = Prisma.ParticipationGetPayload<{}>;

// イベントと関連する参加記録を含む拡張タイプ
export type EventWithParticipations = Prisma.EventGetPayload<{
  include: {
    participations: {
      include: {
        participant: true;
      };
    };
  };
}>;

// 参加者と統計情報を含む拡張タイプ
export type ParticipantWithStats = Prisma.ParticipantGetPayload<{
  include: {
    participations: {
      include: {
        event: true;
      };
    };
  };
}> & {
  winRate: number;
  totalEvents: number;
  netBalance: number;
};

// フォーム用の型定義
export type EventFormData = Omit<Event, 'id' | 'createdAt' | 'updatedAt'>;
export type ParticipantFormData = Omit<Participant, 'id' | 'createdAt' | 'updatedAt'>;
export type JankenFormData = {
  winnerId: string;
  loserId: string;
  winnerChoice: string;
  loserChoice: string;
  amount: number;
};
EOF

# 2. shadcn/uiのtoastコンポーネントを追加
echo "🎨 Toast UIコンポーネントを追加しています..."
mkdir -p components/ui
cat > components/ui/use-toast.ts << 'EOF'
// Inspired by react-hot-toast library
import * as React from "react"

import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast"

const TOAST_LIMIT = 5
const TOAST_REMOVE_DELAY = 5000

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

type ActionType = typeof actionTypes

type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast> & { id: string }
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: string
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: string
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        if (toastTimeouts.has(toastId)) {
          clearTimeout(toastTimeouts.get(toastId))
          toastTimeouts.delete(toastId)
        }
      } else {
        for (const [id, timeout] of toastTimeouts.entries()) {
          clearTimeout(timeout)
          toastTimeouts.delete(id)
        }
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const useToast = () => {
  const [state, dispatch] = React.useReducer(reducer, {
    toasts: [],
  })

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dispatch({
          type: "DISMISS_TOAST",
        })
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const toast = React.useMemo(
    () => ({
      ...state,
      toast: (props: Omit<ToasterToast, "id">) => {
        const id = crypto.randomUUID()
        const newToast = { id, ...props }

        dispatch({
          type: "ADD_TOAST",
          toast: newToast,
        })

        return id
      },
      update: (id: string, props: Partial<Omit<ToasterToast, "id">>) => {
        if (!id) return

        dispatch({
          type: "UPDATE_TOAST",
          toast: { id, ...props },
        })
      },
      dismiss: (toastId?: string) => {
        dispatch({
          type: "DISMISS_TOAST",
          toastId,
        })
      },
      remove: (toastId?: string) => {
        dispatch({
          type: "REMOVE_TOAST",
          toastId,
        })
      },
    }),
    [state]
  )

  return toast
}

type Toast = ReturnType<typeof useToast>

const ToastContext = React.createContext<Toast | null>(null)

function ToastProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const toast = useToast()

  return (
    <ToastContext.Provider value={toast}>
      {children}
    </ToastContext.Provider>
  )
}

function useToastContext() {
  const context = React.useContext(ToastContext)

  if (context === null) {
    throw new Error("useToast must be used within a ToastProvider")
  }

  return context
}

export {
  useToast,
  useToastContext,
  ToastProvider,
}
EOF

cat > components/ui/toast.tsx << 'EOF'
import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const ToastProvider = ToastPrimitives.Provider

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full",
  {
    variants: {
      variant: {
        default: "border bg-background text-foreground",
        destructive:
          "destructive group border-destructive bg-destructive text-destructive-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  )
})
Toast.displayName = ToastPrimitives.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive",
      className
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100 group-[.destructive]:text-red-300 group-[.destructive]:hover:text-red-50 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-sm font-semibold", className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("text-sm opacity-90", className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>

type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}
EOF

cat > components/ui/toaster.tsx << 'EOF'
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { useToastContext } from "@/components/ui/use-toast"

export function Toaster() {
  const { toasts } = useToastContext()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
EOF

# 3. lib/utils/participations.tsの修正
echo "📝 参加記録ユーティリティを修正しています..."
cat > lib/utils/participations.ts << 'EOF'
import type { Participation } from '@/types';

export async function getParticipationsByEventId(eventId: string): Promise<Participation[]> {
  const response = await fetch(`/api/events/${eventId}/participations`);
  if (!response.ok) {
    throw new Error('参加記録の取得に失敗しました');
  }
  return response.json();
}

export async function createParticipation(participationData: Omit<Participation, 'id' | 'createdAt' | 'updatedAt'>): Promise<Participation> {
  const response = await fetch('/api/participations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(participationData),
  });

  if (!response.ok) {
    throw new Error('参加記録の作成に失敗しました');
  }
  return response.json();
}

export async function updateParticipation(id: string, participationData: Partial<Participation>): Promise<Participation> {
  const response = await fetch(`/api/participations/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(participationData),
  });

  if (!response.ok) {
    throw new Error('参加記録の更新に失敗しました');
  }
  return response.json();
}

export async function recordJankenResult(
  eventId: string,
  winnerId: string,
  loserId: string,
  winnerChoice: string,
  loserChoice: string,
  amount: number
): Promise<void> {
  const response = await fetch(`/api/events/${eventId}/janken`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      winnerId,
      loserId,
      winnerChoice,
      loserChoice,
      amount
    }),
  });

  if (!response.ok) {
    throw new Error('じゃんけん結果の記録に失敗しました');
  }
}
EOF

# 4. lib/utils/participants.tsの修正
echo "📝 参加者ユーティリティを修正しています..."
cat > lib/utils/participants.ts << 'EOF'
import type { Participant, ParticipantWithStats } from '@/types';

export async function getAllParticipants(): Promise<Participant[]> {
  const response = await fetch('/api/participants');
  if (!response.ok) {
    throw new Error('参加者の取得に失敗しました');
  }
  return response.json();
}

export async function getParticipantById(id: string): Promise<ParticipantWithStats | null> {
  const response = await fetch(`/api/participants/${id}`);
  if (!response.ok) {
    throw new Error('参加者の取得に失敗しました');
  }
  return response.json();
}

export async function createParticipant(participantData: Omit<Participant, 'id' | 'createdAt' | 'updatedAt'>): Promise<Participant> {
  const response = await fetch('/api/participants', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(participantData),
  });

  if (!response.ok) {
    throw new Error('参加者の作成に失敗しました');
  }
  return response.json();
}

export async function updateParticipant(id: string, participantData: Partial<Participant>): Promise<Participant> {
  const response = await fetch(`/api/participants/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(participantData),
  });

  if (!response.ok) {
    throw new Error('参加者の更新に失敗しました');
  }
  return response.json();
}

export async function deleteParticipant(id: string): Promise<void> {
  const response = await fetch(`/api/participants/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('参加者の削除に失敗しました');
  }
}
EOF

# 5. lib/utils/events.tsの修正
echo "📝 イベントユーティリティを修正しています..."
cat > lib/utils/events.ts << 'EOF'
import type { Event, EventWithParticipations } from '@/types';

export async function getAllEvents(): Promise<Event[]> {
  const response = await fetch('/api/events');
  if (!response.ok) {
    throw new Error('イベントの取得に失敗しました');
  }
  return response.json();
}

export async function getEventById(id: string): Promise<EventWithParticipations | null> {
  const response = await fetch(`/api/events/${id}`);
  if (!response.ok) {
    throw new Error('イベントの取得に失敗しました');
  }
  return response.json();
}

export async function createEvent(eventData: Omit<Event, 'id' | 'createdAt' | 'updatedAt'>): Promise<Event> {
  const response = await fetch('/api/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventData),
  });

  if (!response.ok) {
    throw new Error('イベントの作成に失敗しました');
  }
  return response.json();
}

export async function updateEvent(id: string, eventData: Partial<Event>): Promise<Event> {
  const response = await fetch(`/api/events/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventData),
  });

  if (!response.ok) {
    throw new Error('イベントの更新に失敗しました');
  }
  return response.json();
}

export async function deleteEvent(id: string): Promise<void> {
  const response = await fetch(`/api/events/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('イベントの削除に失敗しました');
  }
}
EOF

# 6. janken-form.tsxの構文エラー修正
echo "🔧 じゃんけんフォームの構文エラーを修正しています..."
cat > components/events/janken-form.tsx << 'EOF'
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { Participant } from "@/types";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { recordJankenResult } from "@/lib/utils/participations";

const jankenSchema = z.object({
  winnerId: z.string().min(1, "勝者は必須です"),
  loserId: z.string().min(1, "敗者は必須です"),
  winnerChoice: z.enum(["グー", "チョキ", "パー"], {
    required_error: "勝者の手は必須です",
  }),
  loserChoice: z.enum(["グー", "チョキ", "パー"], {
    required_error: "敗者の手は必須です",
  }),
  amount: z.coerce.number().min(1, "金額は1円以上で入力してください"),
});

type JankenFormProps = {
  eventId: string;
  participants: Participant[];
};

export function JankenForm({ eventId, participants }: JankenFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof jankenSchema>>({
    resolver: zodResolver(jankenSchema),
    defaultValues: {
      winnerId: "",
      loserId: "",
      winnerChoice: undefined,
      loserChoice: undefined,
      amount: 1000,
    },
  });

  const winnerId = form.watch("winnerId");
  const loserId = form.watch("loserId");

  const onSubmit = async (data: z.infer<typeof jankenSchema>) => {
    if (data.winnerId === data.loserId) {
      form.setError("loserId", {
        type: "manual",
        message: "勝者と敗者は異なる人を選択してください",
      });
      return;
    }

    // じゃんけんの手の整合性をチェック
    const validCombinations = [
      { winner: "グー", loser: "チョキ" },
      { winner: "チョキ", loser: "パー" },
      { winner: "パー", loser: "グー" },
    ];

    const isValidCombination = validCombinations.some(
      combo => combo.winner === data.winnerChoice && combo.loser === data.loserChoice
    );

    if (!isValidCombination) {
      form.setError("loserChoice", {
        type: "manual",
        message: `${data.winnerChoice}は${data.loserChoice}に勝てません`,
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await recordJankenResult(
        eventId,
        data.winnerId,
        data.loserId,
        data.winnerChoice,
        data.loserChoice,
        data.amount
      );

      toast({
        title: "じゃんけん結果を記録しました",
        description: `${participants.find(p => p.id === data.winnerId)?.name}の勝ち (${data.amount.toLocaleString()}円)`,
      });

      // フォームをリセット
      form.reset({
        winnerId: "",
        loserId: "",
        winnerChoice: undefined,
        loserChoice: undefined,
        amount: 1000,
      });

      // 画面を更新
      router.refresh();
    } catch (error) {
      console.error("Failed to record janken result:", error);
      toast({
        title: "エラーが発生しました",
        description: "じゃんけん結果の記録に失敗しました。後でもう一度お試しください。",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="winnerId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>勝者</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="勝者を選択" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {participants.map((participant) => (
                      <SelectItem
                        key={participant.id}
                        value={participant.id}
                        disabled={participant.id === loserId}
                      >
                        {participant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="loserId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>敗者</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="敗者を選択" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {participants.map((participant) => (
                      <SelectItem
                        key={participant.id}
                        value={participant.id}
                        disabled={participant.id === winnerId}
                      >
                        {participant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="winnerChoice"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel>勝者の手</FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    className="flex space-x-4"
                  >
                    <FormItem className="flex items-center space-x-1 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="グー" />
                      </FormControl>
                      <FormLabel className="font-normal cursor-pointer">
                        グー
                      </FormLabel>
                    </FormItem>
                    <FormItem className="flex items-center space-x-1 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="チョキ" />
                      </FormControl>
                      <FormLabel className="font-normal cursor-pointer">
                        チョキ
                      </FormLabel>
                    </FormItem>
                    <FormItem className="flex items-center space-x-1 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="パー" />
                      </FormControl>
                      <FormLabel className="font-normal cursor-pointer">
                        パー
                      </FormLabel>
                    </FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="loserChoice"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel>敗者の手</FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    className="flex space-x-4"
                  >
                    <FormItem className="flex items-center space-x-1 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="グー" />
                      </FormControl>
                      <FormLabel className="font-normal cursor-pointer">
                        グー
                      </FormLabel>
                    </FormItem>
                    <FormItem className="flex items-center

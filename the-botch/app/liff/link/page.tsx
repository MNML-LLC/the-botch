"use client";

// LIFF LINE アカウント連携ページ
//
// 1. `@line/liff` を動的 import → `NEXT_PUBLIC_LIFF_ID` で init
// 2. 未ログインなら `liff.login()` で LINE ログインを促す
// 3. アクティブメンバー一覧を取得し、ユーザーに「あなたは誰か」を選ばせる
// 4. `liff.getIDToken()` を `POST /api/line/link` に渡し `MemberLineAccount` を upsert
//
// 参考: shift-scheduler-ai-liff の連携フロー
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useMembers, type Member } from "@/hooks/use-members";

type Phase =
  | "initializing"
  | "not_configured"
  | "logging_in"
  | "select_member"
  | "linking"
  | "success"
  | "error";

interface Profile {
  userId: string;
  displayName: string;
}

export default function LiffLinkPage() {
  const [phase, setPhase] = useState<Phase>("initializing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [linkedMember, setLinkedMember] = useState<Member | null>(null);

  const { data: members = [], isLoading: membersLoading } = useMembers({
    // LIFF ページは初回に確実に最新を取りたいので短めに
    staleTime: 60 * 1000,
    enabled: phase === "select_member" || phase === "linking",
  });

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
      if (!liffId) {
        if (!cancelled) {
          setPhase("not_configured");
        }
        return;
      }

      try {
        const liffModule = await import("@line/liff");
        const liff = liffModule.default;
        await liff.init({ liffId });

        if (!liff.isLoggedIn()) {
          if (!cancelled) setPhase("logging_in");
          // LINE 認可画面に遷移。戻ってきたら useEffect が再実行される
          liff.login({ redirectUri: window.location.href });
          return;
        }

        const [token, prof] = await Promise.all([
          Promise.resolve(liff.getIDToken()),
          liff.getProfile(),
        ]);

        if (!token) {
          throw new Error("LINE の ID トークンを取得できませんでした");
        }

        if (cancelled) return;
        setIdToken(token);
        setProfile({ userId: prof.userId, displayName: prof.displayName });
        setPhase("select_member");
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setErrorMessage(`LIFF の初期化に失敗しました: ${message}`);
        setPhase("error");
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLink = useCallback(async () => {
    if (!idToken || !selectedMemberId) return;

    setPhase("linking");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/line/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, memberId: selectedMemberId }),
      });

      if (!res.ok) {
        const data: { error?: string } = await res.json().catch(() => ({}));
        throw new Error(data.error || `連携に失敗しました (status=${res.status})`);
      }

      const chosen = members.find((m) => m.id === selectedMemberId) ?? null;
      setLinkedMember(chosen);
      setPhase("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      setPhase("error");
    }
  }, [idToken, selectedMemberId, members]);

  if (phase === "not_configured") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>LINE 連携は未設定です</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-600">
          管理者に `NEXT_PUBLIC_LIFF_ID` の設定を依頼してください。
        </CardContent>
      </Card>
    );
  }

  if (phase === "initializing" || phase === "logging_in") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>LINE 連携</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-600">
          <p>
            {phase === "logging_in"
              ? "LINE ログイン画面に移動しています..."
              : "LIFF を初期化しています..."}
          </p>
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (phase === "success") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>連携が完了しました</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-700">
          <p>
            {linkedMember?.name ?? "メンバー"} と LINE
            アカウントを紐づけました。今後、未払い精算があると LINE
            に自動通知されます。
          </p>
          <p className="text-xs text-gray-500">
            このタブは閉じて構いません。
          </p>
        </CardContent>
      </Card>
    );
  }

  if (phase === "error") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>エラーが発生しました</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-red-600">
          <p>{errorMessage ?? "不明なエラーが発生しました"}</p>
          <Button
            variant="outline"
            onClick={() => {
              setErrorMessage(null);
              setPhase("initializing");
              // ページ全体を初期化するのが確実
              window.location.reload();
            }}
          >
            再試行
          </Button>
        </CardContent>
      </Card>
    );
  }

  // select_member / linking
  const isLinking = phase === "linking";

  return (
    <Card>
      <CardHeader>
        <CardTitle>LINE アカウントを紐づけ</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {profile && (
          <p className="text-sm text-gray-600">
            LINE 名: <span className="font-medium">{profile.displayName}</span>
          </p>
        )}
        <div>
          <p className="text-sm text-gray-700 mb-2">
            あなたはどのメンバーですか？
          </p>
          {membersLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : members.length === 0 ? (
            <p className="text-sm text-gray-500">メンバーが登録されていません</p>
          ) : (
            <RadioGroup
              value={selectedMemberId}
              onValueChange={setSelectedMemberId}
              disabled={isLinking}
            >
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 rounded-md border px-3 py-2"
                >
                  <RadioGroupItem
                    value={member.id}
                    id={`member-${member.id}`}
                  />
                  <Label
                    htmlFor={`member-${member.id}`}
                    className="flex flex-1 items-center gap-2 cursor-pointer"
                  >
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${member.colorBg} ${member.colorText}`}
                    >
                      {member.initial}
                    </span>
                    <span className="text-sm font-medium text-slate-800">
                      {member.name}
                    </span>
                    <span className="text-xs text-gray-500 ml-1">
                      {member.fullName}
                    </span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}
        </div>
        <Button
          className="w-full"
          onClick={handleLink}
          disabled={!selectedMemberId || isLinking}
        >
          {isLinking ? "連携中..." : "この情報で連携する"}
        </Button>
      </CardContent>
    </Card>
  );
}

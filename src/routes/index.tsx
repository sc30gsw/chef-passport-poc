import { createFileRoute } from "@tanstack/react-router";
import { cn } from "cnfast";
import { useState } from "react";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const [isBlue, setIsBlue] = useState(false);
  return (
    <main className="grid min-h-screen place-items-center">
      <div className="space-y-4">
        <h1 className={cn("text-5xl font-bold text-red-500", isBlue && "text-blue-500")}>
          Hello World!
        </h1>
        <button type="button" onClick={() => setIsBlue((prev) => !prev)}>
          Toggle
        </button>
      </div>
    </main>
  );
}

"use client";

import { driver } from "driver.js";
import "driver.js/dist/driver.css";

export function TutorialButton({
  label = "New to investing?",
}: {
  label?: string;
}) {
  const startTour = () => {
    const driverObj = driver({
      showProgress: true,
      steps: [
        {
          element: "#global-search",
          popover: {
            title: "Search stocks",
            description: "Search for a company or stock symbol here.",
          },
        },
        {
          element: "a[href^='/stock/']",
          popover: {
            title: "Open a stock",
            description:
              "Open a stock to see its price and historical performance.",
          },
        },
        {
          element: ".stock-chart-panel",
          popover: {
            title: "Price history",
            description:
              "This chart shows how the stock price has changed over time.",
          },
        },
        {
          element: "a[href='/compare']",
          popover: {
            title: "Compare stocks",
            description:
              "Compare multiple stocks to understand their relative historical performance.",
          },
        },
        {
          element: ".simulated-buy-button",
          popover: {
            title: "Virtual buying",
            description:
              "Try buying stocks using virtual money. No real transaction occurs.",
          },
        },
        {
          element: "a[href='/portfolio']",
          popover: {
            title: "Portfolio",
            description: "Track your virtual investments here.",
          },
        },
      ],
    });

    driverObj.drive();
  };

  return (
    <button
      type="button"
      onClick={startTour}
      className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
    >
      {label}
    </button>
  );
}

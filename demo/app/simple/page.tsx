"use client";

import { RiffScore } from "@riffscore/RiffScore";

export default function SimplePage() {

    const config = {
        score: {
            title: "Simple Score",
            measureCount: 4,
            keySignature: "C"
        }
    };


  return (
    <div style={{ padding: "2rem" }}>
      <h1>Simple RiffScore Demo</h1>
      <p>Just drop in the component with zero configuration:</p>
      
      <RiffScore config={config} />
    </div>
  );
}

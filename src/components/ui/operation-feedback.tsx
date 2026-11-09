"use client";
import { createContext } from "react";
export const OperationFeedback = createContext<{error:string|null;reset:()=>void}>({error:null,reset:()=>{}});

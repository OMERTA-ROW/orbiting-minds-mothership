import {createFileRoute} from "@tanstack/react-router";
import {NexusWorkspace} from "@/components/nexus/Workspace";
import {seo} from "@/lib/seo";
export const Route=createFileRoute("/command-nexus")({head:()=>seo("Command Nexus · Unified Developer Studio","Evolution Mothership project-aware local DEMO workspace: explicit AI draft routing, independent threads, isolated code review, provider planning permissions and inert Unity/Blender references. No connected providers or desktop execution."),component:NexusWorkspace});
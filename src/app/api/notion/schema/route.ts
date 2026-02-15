import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createNotionClient, notionRequest } from "@/lib/notion/client";

/* ------------------------------------------------------------------ */
/*  GET /api/notion/schema                                              */
/*  Fetch the Notion database schema with select options               */
/*  Returns property definitions including available options for        */
/*  select/multi_select/status fields to power planning dropdowns      */
/* ------------------------------------------------------------------ */

export interface NotionPropertySchema {
  name: string;
  type: string;
  options?: Array<{ name: string; color?: string }>;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: state } = await supabase
    .from("notion_sync_state")
    .select("notion_access_token, notion_database_id, property_map")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!state || !state.notion_database_id) {
    return NextResponse.json(
      { error: "No Notion database connected" },
      { status: 400 }
    );
  }

  try {
    const notion = createNotionClient(state.notion_access_token);
    const db = await notionRequest(() =>
      notion.dataSources.retrieve({
        data_source_id: state.notion_database_id,
      })
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbAny = db as any;
    const properties: Record<string, NotionPropertySchema> = {};

    if (dbAny.properties) {
      for (const [name, prop] of Object.entries(dbAny.properties)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = prop as any;
        const schema: NotionPropertySchema = {
          name,
          type: p.type,
        };

        // Extract options from select/multi_select/status properties
        if (p.type === "select" && p.select?.options) {
          schema.options = p.select.options.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (o: any) => ({ name: o.name, color: o.color })
          );
        } else if (p.type === "multi_select" && p.multi_select?.options) {
          schema.options = p.multi_select.options.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (o: any) => ({ name: o.name, color: o.color })
          );
        } else if (p.type === "status" && p.status?.options) {
          schema.options = p.status.options.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (o: any) => ({ name: o.name, color: o.color })
          );
        }

        properties[name] = schema;
      }
    }

    // Map our field names to the Notion property schemas using property_map
    const propertyMap = (state.property_map || {}) as Record<string, string>;
    const fieldOptions: Record<string, Array<{ name: string; color?: string }>> = {};

    for (const [fieldName, notionPropName] of Object.entries(propertyMap)) {
      const schema = properties[notionPropName];
      if (schema?.options && schema.options.length > 0) {
        fieldOptions[fieldName] = schema.options;
      }
    }

    return NextResponse.json({
      properties,
      fieldOptions,
      propertyMap,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch schema";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

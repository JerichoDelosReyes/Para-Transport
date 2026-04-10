import os
import re

tables = set()
rls = set()

for file in os.listdir('supabase/migrations'):
    if file.endswith('.sql'):
        with open(f'supabase/migrations/{file}') as f:
            content = f.read()
            # find all CREATE TABLE regex: "CREATE TABLE [IF NOT EXISTS] [public.]table_name"
            # ignoring case
            for match in re.finditer(r'CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(?:public\.)?([a-zA-Z0-9_]+)', content, re.IGNORECASE):
                tables.add(match.group(1))
            
            # find all ALTER TABLE [public.]table_name ENABLE ROW LEVEL SECURITY
            for match in re.finditer(r'ALTER TABLE\s+(?:public\.)?([a-zA-Z0-9_]+)\s+ENABLE ROW LEVEL SECURITY', content, re.IGNORECASE):
                rls.add(match.group(1))

print("Tables found:", tables)
print("RLS found:", rls)
print("Tables without RLS:", tables - rls)

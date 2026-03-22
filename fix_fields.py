import os

files_to_fix = ['app/login.tsx', 'app/register.tsx']

for file_path in files_to_fix:
    if os.path.exists(file_path):
        with open(file_path, 'r') as f:
            content = f.read()
        
        content = content.replace('total_km: 0,', 'distance: 0,\n        trips: 0,')
        content = content.replace('total_fare_spent: 0,', 'spent: 0,')
        
        with open(file_path, 'w') as f:
            f.write(content)
        print(f"Fixed {file_path}")

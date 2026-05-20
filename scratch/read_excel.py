import pandas as pd
import json

try:
    df = pd.read_excel(r"C:\Users\mohdm\Downloads\FMAC_Requests_All_2026-05-18.xlsx")
    print("Columns:", df.columns.tolist())
    print("\nFirst 2 rows:")
    print(json.dumps(df.head(2).to_dict(orient='records'), default=str, indent=2))
except Exception as e:
    print("Error:", e)

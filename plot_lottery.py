import pandas as pd
import matplotlib.pyplot as plt

# Load the CSV file
df = pd.read_csv('windfall_history_lottolyzer.csv')

# Rename 'date' column for clarity
df.rename(columns={'date': 'Draw Date'}, inplace=True)

# Identify number columns
number_columns = [col for col in df.columns if col.startswith('main') or col.startswith('supp')]

# Melt the number columns into long format
df_melted = df.melt(id_vars=['Draw Date'], value_vars=number_columns,
                    var_name='Position', value_name='Number')

# Convert 'Draw Date' to datetime
df_melted['Draw Date'] = pd.to_datetime(df_melted['Draw Date'])

# Create the scatter plot with flipped axes
plt.figure(figsize=(16, 9), dpi=300)
plt.scatter(df_melted['Number'], df_melted['Draw Date'], alpha=0.6, s=10)
plt.title('Drawn Numbers Over Time')
plt.xlabel('Lottery Number')
plt.ylabel('Draw Date')
plt.xticks(sorted(df_melted['Number'].unique()))  # Label every number
plt.grid(True)

# Save as high-resolution vector image
plt.savefig('lottery_number_labels_xaxis.svg', format='svg')
plt.savefig('lottery_number_labels_xaxis.pdf', format='pdf')
plt.show()

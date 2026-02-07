$text = [System.IO.File]::ReadAllText("c:/projects/oneduo-main/deployment_schema.sql")
# Match CREATE POLICY "name" ON table
# Use Singleline mode to allow . to match newlines
$matches = [regex]::Matches($text, 'CREATE POLICY\s+"([^"]+)"\s+ON\s+storage\.objects', [System.Text.RegularExpressions.RegexOptions]::Singleline)

$names = $matches | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
$drops = $names | ForEach-Object { "DROP POLICY IF EXISTS `"$_`" ON storage.objects;" }
$drops | Out-File -FilePath "c:/projects/oneduo-main/storage_drops.sql" -Encoding UTF8

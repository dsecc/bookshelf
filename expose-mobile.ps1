# Ejecutar como Administrador en Windows PowerShell

# IP de WSL (se actualiza cada reinicio)
$wslIP = (wsl hostname -I).Split()[0]
$port = 8090

Write-Host "WSL IP: $wslIP"
Write-Host "Configurando port forwarding $port -> WSL:$port"

# Eliminar regla previa si existe
netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null

# Agregar port forwarding
netsh interface portproxy add v4tov4 listenport=$port listenaddress=0.0.0.0 connectport=$port connectaddress=$wslIP

# Abrir firewall
netsh advfirewall firewall delete rule name="Bookshelf $port" 2>$null
netsh advfirewall firewall add rule name="Bookshelf $port" dir=in action=allow protocol=TCP localport=$port

# Mostrar IP de Windows para el celular
$winIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notmatch "Loopback|WSL|vEthernet" -and $_.IPAddress -notmatch "^169"}).IPAddress
Write-Host ""
Write-Host "==================================="
Write-Host "Desde el celular abre:"
Write-Host "http://${winIP}:${port}"
Write-Host "==================================="

# Verificar
netsh interface portproxy show all

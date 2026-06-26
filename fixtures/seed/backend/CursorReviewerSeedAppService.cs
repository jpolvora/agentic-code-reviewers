using System;
using System.Threading.Tasks;
// Removed: internal reference
using Volo.Abp.Domain.Repositories;

namespace SampleApp.CursorReviewerSeed;

/// <summary>
/// CURSOR-REVIEWER-SEED — arquivo temporário para validar o revisor agêntico.
/// REMOVER ANTES DO PUSH (ver scripts/cursor-reviewer/SEED-ISSUES.md).
/// </summary>
public class CursorReviewerSeedAppService
{
    private readonly IRepository<Cliente, Guid> _clienteRepository;

    public CursorReviewerSeedAppService(IRepository<Cliente, Guid> clienteRepository)
    {
        _clienteRepository = clienteRepository;
    }

    // SEED-B1: exclusão de cadastro sem [Authorize] nem permissão ABP
    public async Task DeleteClienteSeedAsync(Guid id)
    {
        await _clienteRepository.DeleteAsync(id);
    }

    // SEED-B2: bloqueio síncrono com .Result em operação async do EF/ABP
    public string GetClienteNomeBloqueante(Guid id)
    {
        var cliente = _clienteRepository.GetAsync(id).Result;
        return cliente.RazaoSocial ?? string.Empty;
    }

    // SEED-B3: Guid.Empty não rejeitado — default semanticamente inválido segue ao repositório
    public async Task<string> GetClienteDocumentoPermissivoAsync(Guid id)
    {
        var cliente = await _clienteRepository.GetAsync(id);
        return cliente.CpfCnpj ?? string.Empty;
    }
}
